package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPromptAuditBlockedErrorCode(t *testing.T) {
	assert.Equal(t, ErrorCode("prompt_audit_blocked"), ErrorCodePromptAuditBlocked)
}
