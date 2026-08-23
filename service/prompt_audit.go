package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	pathpkg "path"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	promptauditsetting "github.com/QuantumNous/new-api/setting/prompt_audit_setting"
)

const promptAuditMaxResponseBytes = 1 << 20

type PromptAuditResult struct {
	Confidence       float64 `json:"confidence"`
	Reason           string  `json:"reason"`
	DurationMs       int64   `json:"duration_ms"`
	AuditModelOutput string  `json:"-"`
}

func (result PromptAuditResult) Blocked(threshold float64) bool {
	return result.Confidence >= threshold
}

type PromptAuditClient struct {
	httpClient *http.Client
}

func NewPromptAuditClient(client *http.Client) *PromptAuditClient {
	return &PromptAuditClient{httpClient: client}
}

func (client *PromptAuditClient) Test(ctx context.Context, settings promptauditsetting.Settings, prompt string) (PromptAuditResult, error) {
	startedAt := time.Now()
	endpoint, err := promptAuditEndpoint(settings.BaseURL)
	if err != nil {
		return PromptAuditResult{}, err
	}
	escapedPrompt := strings.ReplaceAll(prompt, "</user_input", "< /user_input")
	escapedPrompt = strings.ReplaceAll(escapedPrompt, "<user_input", "< user_input")
	requestBody, err := common.Marshal(struct {
		Model    string `json:"model"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
	}{
		Model: settings.Model,
		Messages: []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}{
			{Role: "system", Content: settings.SystemPrompt},
			{Role: "user", Content: "<user_input>" + escapedPrompt + "</user_input>"},
		},
	})
	if err != nil {
		return PromptAuditResult{}, errors.New("审计请求编码失败")
	}
	timeout := time.Duration(settings.TimeoutSeconds) * time.Second
	requestContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestContext, http.MethodPost, endpoint, bytes.NewReader(requestBody))
	if err != nil {
		return PromptAuditResult{}, errors.New("审计地址无效")
	}
	request.Header.Set("Authorization", "Bearer "+settings.APIKey)
	request.Header.Set("Content-Type", "application/json")
	httpClient := client.httpClient
	if httpClient == nil {
		httpClient = GetHttpClient()
	}
	response, err := httpClient.Do(request)
	if err != nil {
		if errors.Is(requestContext.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
			return PromptAuditResult{}, errors.New("审计请求超时")
		}
		return PromptAuditResult{}, errors.New("审计请求失败")
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return PromptAuditResult{}, fmt.Errorf("审计服务返回 HTTP %d", response.StatusCode)
	}
	var upstream struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	responseData, err := io.ReadAll(io.LimitReader(response.Body, promptAuditMaxResponseBytes+1))
	if err != nil {
		return PromptAuditResult{}, errors.New("审计响应读取失败")
	}
	if len(responseData) > promptAuditMaxResponseBytes {
		return PromptAuditResult{}, errors.New("审计响应过大")
	}
	if err := common.Unmarshal(responseData, &upstream); err != nil {
		return PromptAuditResult{}, errors.New("审计响应格式无效")
	}
	if len(upstream.Choices) == 0 {
		return PromptAuditResult{}, errors.New("审计响应缺少结果")
	}
	rawOutput := upstream.Choices[0].Message.Content
	result, err := parsePromptAuditResult(rawOutput)
	if err != nil {
		return PromptAuditResult{AuditModelOutput: rawOutput, DurationMs: time.Since(startedAt).Milliseconds()}, err
	}
	result.AuditModelOutput = rawOutput
	result.DurationMs = time.Since(startedAt).Milliseconds()
	return result, nil
}

func promptAuditEndpoint(baseURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("审计地址无效")
	}
	requestPath := strings.TrimRight(parsed.Path, "/")
	if !strings.HasSuffix(requestPath, "/chat/completions") {
		requestPath = pathpkg.Join(requestPath, "chat/completions")
	}
	if !strings.HasPrefix(requestPath, "/") {
		requestPath = "/" + requestPath
	}
	parsed.Path = requestPath
	parsed.RawPath = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func parsePromptAuditResult(content string) (PromptAuditResult, error) {
	payload := strings.TrimSpace(content)
	if strings.HasPrefix(payload, "```") {
		firstNewline := strings.IndexByte(payload, '\n')
		if firstNewline < 0 || !strings.EqualFold(strings.TrimSpace(payload[:firstNewline]), "```json") || !strings.HasSuffix(payload, "```") {
			return PromptAuditResult{}, errors.New("审计结果不是有效 JSON")
		}
		payload = strings.TrimSpace(strings.TrimSuffix(payload[firstNewline+1:], "```"))
	}
	if len(payload) == 0 || payload[0] != '{' {
		return PromptAuditResult{}, errors.New("审计结果不是 JSON 对象")
	}
	if promptAuditHasDuplicateResultKeys(payload) {
		return PromptAuditResult{}, errors.New("审计结果字段重复")
	}
	var object map[string]json.RawMessage
	if err := common.UnmarshalJsonStr(payload, &object); err != nil {
		return PromptAuditResult{}, errors.New("审计结果不是有效 JSON")
	}
	if len(object) != 2 {
		return PromptAuditResult{}, errors.New("审计结果字段无效")
	}
	confidenceJSON, hasConfidence := object["confidence"]
	reasonJSON, hasReason := object["reason"]
	if !hasConfidence || !hasReason {
		return PromptAuditResult{}, errors.New("审计结果字段无效")
	}
	var confidence *float64
	var reason *string
	if err := common.Unmarshal(confidenceJSON, &confidence); err != nil || confidence == nil || math.IsNaN(*confidence) || math.IsInf(*confidence, 0) || *confidence < 0 || *confidence > 1 {
		return PromptAuditResult{}, errors.New("审计置信度无效")
	}
	if err := common.Unmarshal(reasonJSON, &reason); err != nil || reason == nil {
		return PromptAuditResult{}, errors.New("审计原因无效")
	}
	return PromptAuditResult{Confidence: *confidence, Reason: *reason}, nil
}

func promptAuditHasDuplicateResultKeys(payload string) bool {
	data := []byte(payload)
	depth := 0
	counts := map[string]int{}
	for index := 0; index < len(data); {
		switch data[index] {
		case '"':
			end := index + 1
			for end < len(data) {
				if data[end] == '\\' {
					end += 2
					continue
				}
				if data[end] == '"' {
					break
				}
				end++
			}
			if depth == 1 && end < len(data) {
				next := end + 1
				for next < len(data) && (data[next] == ' ' || data[next] == '\n' || data[next] == '\r' || data[next] == '\t') {
					next++
				}
				if next < len(data) && data[next] == ':' {
					var key string
					if common.Unmarshal(data[index:end+1], &key) == nil && (key == "confidence" || key == "reason") {
						counts[key]++
					}
				}
			}
			index = end + 1
		case '{', '[':
			depth++
			index++
		case '}', ']':
			depth--
			index++
		default:
			index++
		}
	}
	return counts["confidence"] > 1 || counts["reason"] > 1
}

type promptAuditContextPart struct {
	role string
	text string
}

func ExtractPromptAuditText(relayFormat types.RelayFormat, path string, request dto.Request, latestContextOnly bool) (string, bool) {
	if request == nil {
		return "", false
	}
	var parts []string
	switch relayFormat {
	case types.RelayFormatOpenAI:
		if path != "/v1/chat/completions" && path != "/v1/completions" {
			return "", false
		}
		openAIRequest, ok := request.(*dto.GeneralOpenAIRequest)
		if !ok {
			return "", false
		}
		if path == "/v1/chat/completions" && latestContextOnly {
			contextParts := make([]promptAuditContextPart, 0, len(openAIRequest.Messages))
			for index := range openAIRequest.Messages {
				message := &openAIRequest.Messages[index]
				var visible []string
				for _, content := range message.ParseContent() {
					if (content.Type == dto.ContentTypeText || content.Type == "input_text") && content.Text != "" {
						visible = append(visible, content.Text)
					}
				}
				if len(visible) > 0 {
					contextParts = append(contextParts, promptAuditContextPart{role: message.Role, text: strings.Join(visible, "\n")})
				}
			}
			parts = append(parts, selectPromptAuditLatestContext(contextParts)...)
			return strings.Join(parts, "\n"), true
		}
		parts = appendPromptAuditStrings(parts, openAIRequest.Prompt)
		for index := range openAIRequest.Messages {
			message := &openAIRequest.Messages[index]
			var messageParts []string
			for _, content := range message.ParseContent() {
				if (content.Type == dto.ContentTypeText || content.Type == "input_text") && content.Text != "" {
					messageParts = append(messageParts, content.Text)
				}
			}
			if len(messageParts) > 0 {
				parts = append(parts, promptAuditRoleText(message.Role, strings.Join(messageParts, "\n")))
			}
		}
		parts = append(parts, openAIRequest.ParseInput()...)
		if openAIRequest.Instruction != "" {
			parts = append(parts, openAIRequest.Instruction)
		}
		parts = appendPromptAuditStrings(parts, openAIRequest.Prefix)
		parts = appendPromptAuditStrings(parts, openAIRequest.Suffix)
	case types.RelayFormatOpenAIResponses:
		if path != "/v1/responses" {
			return "", false
		}
		responsesRequest, ok := request.(*dto.OpenAIResponsesRequest)
		if !ok {
			return "", false
		}
		if latestContextOnly {
			contextParts := parsePromptAuditInstructionParts(responsesRequest.Instructions)
			contextParts = append(contextParts, parsePromptAuditResponseParts(responsesRequest.Input)...)
			parts = append(parts, selectPromptAuditLatestContext(contextParts)...)
		} else {
			parts = appendPromptAuditJSON(parts, responsesRequest.Instructions)
			parts = appendPromptAuditResponseInput(parts, responsesRequest.Input)
		}
	case types.RelayFormatOpenAIResponsesCompaction:
		if path != "/v1/responses/compact" {
			return "", false
		}
		compactionRequest, ok := request.(*dto.OpenAIResponsesCompactionRequest)
		if !ok {
			return "", false
		}
		if latestContextOnly {
			contextParts := parsePromptAuditInstructionParts(compactionRequest.Instructions)
			contextParts = append(contextParts, parsePromptAuditResponseParts(compactionRequest.Input)...)
			parts = append(parts, selectPromptAuditLatestContext(contextParts)...)
		} else {
			parts = appendPromptAuditJSON(parts, compactionRequest.Instructions)
			parts = appendPromptAuditResponseInput(parts, compactionRequest.Input)
		}
	default:
		return "", false
	}
	return strings.Join(parts, "\n"), true
}

func selectPromptAuditLatestContext(contextParts []promptAuditContextPart) []string {
	latestInstruction := -1
	latestAssistant := -1
	for index, part := range contextParts {
		switch part.role {
		case "system", "developer":
			latestInstruction = index
		case "assistant":
			latestAssistant = index
		}
	}
	selected := make([]string, 0, len(contextParts))
	if latestInstruction >= 0 {
		instruction := contextParts[latestInstruction]
		selected = append(selected, promptAuditRoleText(instruction.role, instruction.text))
	}
	if latestAssistant >= 0 {
		assistant := contextParts[latestAssistant]
		selected = append(selected, promptAuditRoleText(assistant.role, assistant.text))
		for index := latestAssistant + 1; index < len(contextParts); index++ {
			part := contextParts[index]
			if part.role == "assistant" || part.role == "system" || part.role == "developer" {
				continue
			}
			selected = append(selected, promptAuditRoleText(part.role, part.text))
		}
		return selected
	}
	for _, part := range contextParts {
		if part.role == "system" || part.role == "developer" || part.role == "assistant" {
			continue
		}
		selected = append(selected, promptAuditRoleText(part.role, part.text))
	}
	return selected
}

func parsePromptAuditInstructionParts(raw json.RawMessage) []promptAuditContextPart {
	var visible []string
	visible = appendPromptAuditJSON(visible, raw)
	if len(visible) == 0 {
		return nil
	}
	return []promptAuditContextPart{{role: "system", text: strings.Join(visible, "\n")}}
}

func parsePromptAuditResponseParts(raw json.RawMessage) []promptAuditContextPart {
	if len(raw) == 0 {
		return nil
	}
	var value any
	if err := common.Unmarshal(raw, &value); err != nil {
		return nil
	}
	values, ok := value.([]any)
	if !ok {
		var visible []string
		visible = appendPromptAuditVisibleValue(visible, value)
		if len(visible) == 0 {
			return nil
		}
		return []promptAuditContextPart{{text: strings.Join(visible, "\n")}}
	}
	contextParts := make([]promptAuditContextPart, 0, len(values))
	for _, item := range values {
		object, isObject := item.(map[string]any)
		if !isObject {
			var visible []string
			visible = appendPromptAuditVisibleValue(visible, item)
			if len(visible) > 0 {
				contextParts = append(contextParts, promptAuditContextPart{text: strings.Join(visible, "\n")})
			}
			continue
		}
		role, _ := object["role"].(string)
		var visible []string
		visible = appendPromptAuditVisibleValue(visible, object["content"])
		if len(visible) == 0 {
			visible = appendPromptAuditVisibleValue(visible, object)
		}
		if len(visible) > 0 {
			contextParts = append(contextParts, promptAuditContextPart{role: role, text: strings.Join(visible, "\n")})
		}
	}
	return contextParts
}

func appendPromptAuditStrings(parts []string, value any) []string {
	switch typed := value.(type) {
	case string:
		if typed != "" {
			parts = append(parts, typed)
		}
	case []string:
		for _, item := range typed {
			parts = appendPromptAuditStrings(parts, item)
		}
	case []any:
		for _, item := range typed {
			parts = appendPromptAuditStrings(parts, item)
		}
	}
	return parts
}

func appendPromptAuditJSON(parts []string, raw json.RawMessage) []string {
	if len(raw) == 0 {
		return parts
	}
	var value any
	if err := common.Unmarshal(raw, &value); err != nil {
		return parts
	}
	return appendPromptAuditVisibleValue(parts, value)
}

func appendPromptAuditResponseInput(parts []string, raw json.RawMessage) []string {
	if len(raw) == 0 {
		return parts
	}
	var value any
	if err := common.Unmarshal(raw, &value); err != nil {
		return parts
	}
	values, ok := value.([]any)
	if !ok {
		return appendPromptAuditVisibleValue(parts, value)
	}
	for _, item := range values {
		object, isObject := item.(map[string]any)
		if !isObject {
			parts = appendPromptAuditVisibleValue(parts, item)
			continue
		}
		role, _ := object["role"].(string)
		var content []string
		content = appendPromptAuditVisibleValue(content, object["content"])
		if len(content) == 0 {
			content = appendPromptAuditVisibleValue(content, object)
		}
		if len(content) > 0 {
			parts = append(parts, promptAuditRoleText(role, strings.Join(content, "\n")))
		}
	}
	return parts
}

func appendPromptAuditVisibleValue(parts []string, value any) []string {
	switch typed := value.(type) {
	case string:
		if typed != "" {
			parts = append(parts, typed)
		}
	case []any:
		for _, item := range typed {
			parts = appendPromptAuditVisibleValue(parts, item)
		}
	case map[string]any:
		partType, _ := typed["type"].(string)
		if partType == "input_image" || partType == "image_url" || partType == "input_audio" || partType == "input_file" || partType == "file" {
			return parts
		}
		if text, ok := typed["text"].(string); ok && text != "" {
			parts = append(parts, text)
		}
		if content, ok := typed["content"]; ok {
			parts = appendPromptAuditVisibleValue(parts, content)
		}
		if outputText, ok := typed["output_text"]; ok {
			parts = appendPromptAuditVisibleValue(parts, outputText)
		}
		if output, ok := typed["output"]; ok {
			parts = appendPromptAuditOutputValue(parts, output)
		}
		if partType == "function_call_output" || partType == "computer_call_output" || partType == "tool_call_output" {
			keys := make([]string, 0, len(typed))
			for key := range typed {
				switch key {
				case "type", "role", "status", "id", "call_id", "content", "text", "output", "output_text", "image_url", "file_url", "url", "data":
					continue
				}
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				parts = appendPromptAuditVisibleValue(parts, typed[key])
			}
		}
	}
	return parts
}

func appendPromptAuditOutputValue(parts []string, value any) []string {
	switch typed := value.(type) {
	case string:
		if typed != "" {
			parts = append(parts, typed)
		}
	case []any:
		for _, item := range typed {
			parts = appendPromptAuditOutputValue(parts, item)
		}
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			switch key {
			case "type", "role", "status", "id", "call_id", "image_url", "file_url", "url", "data", "audio", "image", "file":
				continue
			}
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			parts = appendPromptAuditOutputValue(parts, typed[key])
		}
	}
	return parts
}

func promptAuditRoleText(role, text string) string {
	if role == "" {
		return text
	}
	return role + ": " + text
}
