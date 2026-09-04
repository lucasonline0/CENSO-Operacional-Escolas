package main

import (
	"sync"
	"testing"
	"time"
)

func TestRateLimiterSweepRemovesInactiveIPs(t *testing.T) {
	rl := &rateLimiter{
		attempts: make(map[string][]time.Time),
		window:   1 * time.Minute,
	}

	// Simulate requests from two IPs within the window.
	rl.allow("10.0.0.1", 5, 1*time.Minute)
	rl.allow("10.0.0.2", 5, 1*time.Minute)

	rl.mu.Lock()
	if len(rl.attempts) != 2 {
		rl.mu.Unlock()
		t.Fatalf("expected 2 tracked IPs, got %d", len(rl.attempts))
	}
	rl.mu.Unlock()

	// Force lastSweep into the past so the next allow() triggers a sweep.
	rl.mu.Lock()
	rl.lastSweep = time.Now().Add(-rlSweepInterval - 1*time.Second)
	rl.mu.Unlock()

	// Wait so that all timestamps in the map are older than the 1-minute window.
	time.Sleep(1*time.Minute + 100*time.Millisecond)

	// A new request from a third IP triggers the sweep.
	rl.allow("10.0.0.3", 5, 1*time.Minute)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// The two inactive IPs should have been removed; only the new one remains.
	if len(rl.attempts) != 1 {
		t.Fatalf("expected 1 tracked IP after sweep, got %d (keys: %v)", len(rl.attempts), mapKeys(rl.attempts))
	}
	if _, ok := rl.attempts["10.0.0.3"]; !ok {
		t.Fatalf("expected 10.0.0.3 to be the remaining key, got %v", mapKeys(rl.attempts))
	}
}

func TestRateLimiterSweepPreservesActiveIPs(t *testing.T) {
	rl := &rateLimiter{
		attempts: make(map[string][]time.Time),
		window:   5 * time.Minute,
	}

	// Request from IP 1 within the window.
	rl.allow("10.0.0.1", 5, 5*time.Minute)

	// Force lastSweep into the past.
	rl.mu.Lock()
	rl.lastSweep = time.Now().Add(-rlSweepInterval - 1*time.Second)
	rl.mu.Unlock()

	// Request from IP 2 — triggers sweep. IP 1 is still within the 5-min window.
	rl.allow("10.0.0.2", 5, 5*time.Minute)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	if len(rl.attempts) != 2 {
		t.Fatalf("expected 2 tracked IPs (both active), got %d", len(rl.attempts))
	}
}

func TestRateLimiterSweepIsThreadSafe(t *testing.T) {
	rl := &rateLimiter{
		attempts: make(map[string][]time.Time),
		window:   1 * time.Minute,
	}

	// Pre-populate with IPs that will be expired.
	for i := 0; i < 100; i++ {
		ip := "10.0." + string(rune('A'+i%26)) + "." + string(rune('0'+i/26))
		rl.attempts[ip] = []time.Time{time.Now().Add(-10 * time.Minute)}
	}

	// Concurrently trigger allow() which calls sweep().
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			ip := "10.1.0." + string(rune('A'+n%26))
			rl.allow(ip, 5, 1*time.Minute)
		}(i)
	}
	wg.Wait()

	// Should not have panicked. Check that old IPs were cleaned.
	rl.mu.Lock()
	defer rl.mu.Unlock()
	for ip := range rl.attempts {
		if len(ip) > 0 && ip[:5] == "10.0." {
			t.Fatalf("old IP %s should have been swept", ip)
		}
	}
}

func mapKeys(m map[string][]time.Time) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
