package models

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"sync"
	"testing"
)

func TestNormalizeSchoolIDs(t *testing.T) {
	tests := []struct {
		name    string
		input   []int
		want    []int
		wantErr error
	}{
		{name: "empty", input: nil, wantErr: ErrSchoolIDsRequired},
		{name: "single", input: []int{7}, want: []int{7}},
		{name: "deduplicates preserving order", input: []int{3, 1, 3, 2, 1}, want: []int{3, 1, 2}},
		{name: "zero invalid", input: []int{1, 0}, wantErr: ErrSchoolInvalidID},
		{name: "negative invalid", input: []int{-1}, wantErr: ErrSchoolInvalidID},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizeSchoolIDs(tc.input)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("expected %v, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if fmt.Sprint(got) != fmt.Sprint(tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestNormalizeSchoolIDsBatchLimit(t *testing.T) {
	atLimit := make([]int, maxSchoolDREBatchSize)
	for i := range atLimit {
		atLimit[i] = i + 1
	}
	if _, err := normalizeSchoolIDs(atLimit); err != nil {
		t.Fatalf("exact limit should be accepted: %v", err)
	}

	overLimit := append(append([]int(nil), atLimit...), maxSchoolDREBatchSize+1)
	if _, err := normalizeSchoolIDs(overLimit); !errors.Is(err, ErrSchoolBatchTooLarge) {
		t.Fatalf("expected batch-too-large error, got %v", err)
	}
}

// Property-style regression coverage: thousands of deterministic random input
// sets prove that normalization only emits positive unique IDs and preserves
// first-seen ordering.
func TestNormalizeSchoolIDsProperties(t *testing.T) {
	rng := rand.New(rand.NewSource(188))
	for iteration := 0; iteration < 5000; iteration++ {
		length := 1 + rng.Intn(80)
		input := make([]int, length)
		for i := range input {
			input[i] = 1 + rng.Intn(40)
		}

		got, err := normalizeSchoolIDs(input)
		if err != nil {
			t.Fatalf("iteration %d: unexpected error: %v", iteration, err)
		}

		seen := make(map[int]bool)
		want := make([]int, 0, len(input))
		for _, id := range input {
			if !seen[id] {
				seen[id] = true
				want = append(want, id)
			}
		}
		if fmt.Sprint(got) != fmt.Sprint(want) {
			t.Fatalf("iteration %d: got %v, want %v", iteration, got, want)
		}
	}
}

type fakeDRE struct {
	name   string
	active bool
}

type fakeSchoolDREState struct {
	mu      sync.Mutex
	dres    map[int]fakeDRE
	schools map[int]string
}

var fakeSchoolDRERegistry = struct {
	sync.Mutex
	states map[string]*fakeSchoolDREState
}{states: make(map[string]*fakeSchoolDREState)}

type fakeSchoolDREDriver struct{}

type fakeSchoolDREConn struct {
	state *fakeSchoolDREState
	tx    *fakeSchoolDRETx
}

type fakeSchoolDRETx struct {
	conn   *fakeSchoolDREConn
	staged map[int]string
	done   bool
}

type fakeSchoolDREStmt struct{ conn *fakeSchoolDREConn }

type fakeSchoolDRERows struct {
	values []driver.Value
	done   bool
}

func (fakeSchoolDREDriver) Open(name string) (driver.Conn, error) {
	fakeSchoolDRERegistry.Lock()
	state := fakeSchoolDRERegistry.states[name]
	fakeSchoolDRERegistry.Unlock()
	if state == nil {
		return nil, fmt.Errorf("unknown fake DB %q", name)
	}
	return &fakeSchoolDREConn{state: state}, nil
}

func (c *fakeSchoolDREConn) Prepare(string) (driver.Stmt, error) { return &fakeSchoolDREStmt{conn: c}, nil }
func (c *fakeSchoolDREConn) Close() error                        { return nil }
func (c *fakeSchoolDREConn) Begin() (driver.Tx, error)           { return c.BeginTx(context.Background(), driver.TxOptions{}) }
func (c *fakeSchoolDREConn) BeginTx(context.Context, driver.TxOptions) (driver.Tx, error) {
	c.state.mu.Lock()
	staged := make(map[int]string, len(c.state.schools))
	for id, dre := range c.state.schools {
		staged[id] = dre
	}
	c.state.mu.Unlock()
	c.tx = &fakeSchoolDRETx{conn: c, staged: staged}
	return c.tx, nil
}
func (c *fakeSchoolDREConn) PrepareContext(context.Context, string) (driver.Stmt, error) {
	return &fakeSchoolDREStmt{conn: c}, nil
}
func (c *fakeSchoolDREConn) QueryContext(_ context.Context, _ string, args []driver.NamedValue) (driver.Rows, error) {
	if len(args) != 1 {
		return nil, fmt.Errorf("expected one DRE arg, got %d", len(args))
	}
	id, ok := args[0].Value.(int64)
	if !ok {
		return nil, fmt.Errorf("unexpected DRE arg type %T", args[0].Value)
	}
	c.state.mu.Lock()
	dre, exists := c.state.dres[int(id)]
	c.state.mu.Unlock()
	if !exists {
		return &fakeSchoolDRERows{}, nil
	}
	return &fakeSchoolDRERows{values: []driver.Value{dre.name, dre.active}}, nil
}

func (tx *fakeSchoolDRETx) Commit() error {
	if tx.done {
		return errors.New("transaction already finished")
	}
	tx.conn.state.mu.Lock()
	tx.conn.state.schools = make(map[int]string, len(tx.staged))
	for id, dre := range tx.staged {
		tx.conn.state.schools[id] = dre
	}
	tx.conn.state.mu.Unlock()
	tx.done = true
	return nil
}
func (tx *fakeSchoolDRETx) Rollback() error {
	if tx.done {
		return sql.ErrTxDone
	}
	tx.done = true
	return nil
}

func (s *fakeSchoolDREStmt) Close() error  { return nil }
func (s *fakeSchoolDREStmt) NumInput() int { return 2 }
func (s *fakeSchoolDREStmt) Exec(args []driver.Value) (driver.Result, error) {
	named := make([]driver.NamedValue, len(args))
	for i, v := range args {
		named[i] = driver.NamedValue{Ordinal: i + 1, Value: v}
	}
	return s.ExecContext(context.Background(), named)
}
func (s *fakeSchoolDREStmt) Query([]driver.Value) (driver.Rows, error) {
	return nil, errors.New("query not supported")
}
func (s *fakeSchoolDREStmt) ExecContext(_ context.Context, args []driver.NamedValue) (driver.Result, error) {
	if s.conn.tx == nil || s.conn.tx.done {
		return nil, errors.New("no active transaction")
	}
	if len(args) != 2 {
		return nil, fmt.Errorf("expected 2 update args, got %d", len(args))
	}
	dreName, ok := args[0].Value.(string)
	if !ok {
		return nil, fmt.Errorf("unexpected DRE name type %T", args[0].Value)
	}
	id64, ok := args[1].Value.(int64)
	if !ok {
		return nil, fmt.Errorf("unexpected school ID type %T", args[1].Value)
	}
	id := int(id64)
	if _, exists := s.conn.tx.staged[id]; !exists {
		return driver.RowsAffected(0), nil
	}
	s.conn.tx.staged[id] = dreName
	return driver.RowsAffected(1), nil
}

func (r *fakeSchoolDRERows) Columns() []string { return []string{"nome", "ativa"} }
func (r *fakeSchoolDRERows) Close() error      { return nil }
func (r *fakeSchoolDRERows) Next(dest []driver.Value) error {
	if r.done || len(r.values) == 0 {
		return io.EOF
	}
	copy(dest, r.values)
	r.done = true
	return nil
}

var registerFakeSchoolDREDriver sync.Once

func openFakeSchoolDREDB(t *testing.T, state *fakeSchoolDREState) *sql.DB {
	t.Helper()
	registerFakeSchoolDREDriver.Do(func() { sql.Register("school-dre-fake", fakeSchoolDREDriver{}) })
	name := t.Name()
	fakeSchoolDRERegistry.Lock()
	fakeSchoolDRERegistry.states[name] = state
	fakeSchoolDRERegistry.Unlock()
	t.Cleanup(func() {
		fakeSchoolDRERegistry.Lock()
		delete(fakeSchoolDRERegistry.states, name)
		fakeSchoolDRERegistry.Unlock()
	})
	db, err := sql.Open("school-dre-fake", name)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestAssignToDREAtomicSuccessAndCanonicalization(t *testing.T) {
	state := &fakeSchoolDREState{
		dres:    map[int]fakeDRE{10: {name: "  DRE CANÔNICA  ", active: true}},
		schools: map[int]string{1: "DRE ANTIGA", 2: "Outra"},
	}
	model := &SchoolModel{DB: openFakeSchoolDREDB(t, state)}

	name, updated, err := model.AssignToDRE(context.Background(), 10, []int{1, 1, 2})
	if err != nil {
		t.Fatalf("AssignToDRE: %v", err)
	}
	if name != "DRE CANÔNICA" || updated != 2 {
		t.Fatalf("got name=%q updated=%d", name, updated)
	}
	if state.schools[1] != "DRE CANÔNICA" || state.schools[2] != "DRE CANÔNICA" {
		t.Fatalf("canonical DRE was not persisted atomically: %+v", state.schools)
	}
}

func TestAssignToDRERollsBackWholeBatchWhenSchoolMissing(t *testing.T) {
	state := &fakeSchoolDREState{
		dres:    map[int]fakeDRE{10: {name: "DRE NOVA", active: true}},
		schools: map[int]string{1: "DRE ORIGINAL"},
	}
	model := &SchoolModel{DB: openFakeSchoolDREDB(t, state)}

	_, _, err := model.AssignToDRE(context.Background(), 10, []int{1, 999})
	if !errors.Is(err, ErrSchoolNotFound) {
		t.Fatalf("expected ErrSchoolNotFound, got %v", err)
	}
	if state.schools[1] != "DRE ORIGINAL" {
		t.Fatalf("partial update escaped rollback: %+v", state.schools)
	}
}

func TestAssignToDRERejectsMissingOrInactiveMasterDRE(t *testing.T) {
	tests := []struct {
		name    string
		dres    map[int]fakeDRE
		wantErr error
	}{
		{name: "missing", dres: map[int]fakeDRE{}, wantErr: ErrDRENotFound},
		{name: "inactive", dres: map[int]fakeDRE{10: {name: "DRE INATIVA", active: false}}, wantErr: ErrDREInactive},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			state := &fakeSchoolDREState{dres: tc.dres, schools: map[int]string{1: "DRE ORIGINAL"}}
			model := &SchoolModel{DB: openFakeSchoolDREDB(t, state)}
			_, _, err := model.AssignToDRE(context.Background(), 10, []int{1})
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("expected %v, got %v", tc.wantErr, err)
			}
			if state.schools[1] != "DRE ORIGINAL" {
				t.Fatalf("school changed after rejected DRE: %+v", state.schools)
			}
		})
	}
}
