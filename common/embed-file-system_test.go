package common

import (
	"embed"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

//go:embed all:testdata/embedded-site
var embeddedSiteFS embed.FS

func TestEmbedFolderServesNestedDirectoryIndex(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(static.Serve("/", EmbedFolder(embeddedSiteFS, "testdata/embedded-site")))
	router.NoRoute(func(c *gin.Context) {
		c.String(http.StatusNotFound, "fallback")
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/playgrounds/image/", nil)
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "GPT Image Playground Test") {
		t.Fatalf("expected embedded playground index, got %q", recorder.Body.String())
	}
}

func TestEmbedFolderServesUnderscoreAssets(t *testing.T) {
	fs := EmbedFolder(embeddedSiteFS, "testdata/embedded-site")
	file, err := fs.Open("/playgrounds/image/_next/static/test.js")
	if err != nil {
		t.Fatalf("expected underscore asset to be embedded: %v", err)
	}
	defer file.Close()
}
