package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCensusSubmissionsEnabledIsFailClosed(t *testing.T) {
	t.Setenv("CENSUS_SUBMISSIONS_ENABLED", "")
	if censusSubmissionsEnabled() {
		t.Fatal("empty configuration must close submissions")
	}

	t.Setenv("CENSUS_SUBMISSIONS_ENABLED", "false")
	if censusSubmissionsEnabled() {
		t.Fatal("false configuration must close submissions")
	}

	t.Setenv("CENSUS_SUBMISSIONS_ENABLED", "true")
	if !censusSubmissionsEnabled() {
		t.Fatal("true configuration must enable submissions")
	}
}

func TestRequireCensusSubmissionsBlocksWritesWhenClosed(t *testing.T) {
	for _, value := range []string{"", "false"} {
		t.Run("closed_"+value, func(t *testing.T) {
			t.Setenv("CENSUS_SUBMISSIONS_ENABLED", value)
			called := false
			next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true })
			app := &application{}
			req := httptest.NewRequest(http.MethodPost, "/v1/census", nil)
			res := httptest.NewRecorder()

			app.requireCensusSubmissions(next).ServeHTTP(res, req)

			if called {
				t.Fatal("closed period must not invoke the write handler")
			}
			if res.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want %d", res.Code, http.StatusForbidden)
			}
			var payload jsonResponse
			if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if payload.Code != censusPeriodClosedCode {
				t.Fatalf("code = %q, want %q", payload.Code, censusPeriodClosedCode)
			}
			if payload.Message != errCensusPeriodClosed.Error() {
				t.Fatalf("message = %q, want %q", payload.Message, errCensusPeriodClosed.Error())
			}
		})
	}
}

func TestRequireCensusSubmissionsAllowsWritesWhenEnabled(t *testing.T) {
	t.Setenv("CENSUS_SUBMISSIONS_ENABLED", "true")
	called := false
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true })
	app := &application{}
	req := httptest.NewRequest(http.MethodPost, "/v1/census", nil)
	res := httptest.NewRecorder()

	app.requireCensusSubmissions(next).ServeHTTP(res, req)

	if !called {
		t.Fatal("enabled period must invoke the write handler")
	}
}
