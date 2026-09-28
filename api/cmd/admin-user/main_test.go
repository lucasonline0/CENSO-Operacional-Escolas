package main

import (
    "strings"
    "testing"
)

func TestValidateCreateArgs(t *testing.T) {
    tests := []struct {
        name     string
        username string
        email    string
        dre      string
        wantErr  string
    }{
        {"valido sem email", "user", "", "DRE", ""},
        {"valido com email", "user", "a@b.com", "DRE", ""},
        {"username vazio", "", "", "DRE", "username é obrigatório"},
        {"username whitespace", "  ", "x@y.com", "DRE", "username é obrigatório"},
        {"dre vazio", "user", "x@y.com", "", "dre é obrigatório"},
        {"dre whitespace", "user", "x@y.com", "  ", "dre é obrigatório"},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            err := validateCreateArgs(tc.username, tc.email, tc.dre)
            if tc.wantErr == "" {
                if err != nil {
                    t.Fatalf("esperava nil, got %v", err)
                }
            } else {
                if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
                    t.Fatalf("esperava erro contendo %q, got %v", tc.wantErr, err)
                }
            }
        })
    }
}