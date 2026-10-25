package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"history-timeline/internal/history"
)

// The cases are shared with the extension (extension/test/filter-cases.test.js).
const filterCasesPath = "../../extension/test/filter-cases.json"

type filterCases struct {
	Visits []struct {
		ID         int64  `json:"id"`
		Time       string `json:"time"`
		URL        string `json:"url"`
		Title      string `json:"title"`
		Transition string `json:"transition"`
	} `json:"visits"`
	Cases []struct {
		Name   string `json:"name"`
		Filter struct {
			Start      string   `json:"start"`
			End        string   `json:"end"`
			Text       string   `json:"text"`
			Domain     string   `json:"domain"`
			Categories []string `json:"categories"`
			Hide       bool     `json:"hide"`
		} `json:"filter"`
		Want              []int64 `json:"want"`
		ServerUnsupported bool    `json:"serverUnsupported"`
		Known             *struct {
			Server []int64 `json:"server"`
			Reason string  `json:"reason"`
		} `json:"known"`
	} `json:"cases"`
}

var transitionCodes = map[string]int{"link": 0, "typed": 1, "reload": 8}

func TestSharedFilterCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.FromSlash(filterCasesPath))
	if err != nil {
		t.Fatal(err)
	}
	var fx filterCases
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}

	dir := filepath.Join(t.TempDir(), "Default")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(filepath.Join(dir, "History")))
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{
		`CREATE TABLE urls(id INTEGER PRIMARY KEY, url TEXT, title TEXT)`,
		`CREATE TABLE visits(id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER, from_visit INTEGER, transition INTEGER, visit_duration INTEGER)`,
	} {
		if _, err := db.Exec(s); err != nil {
			t.Fatal(err)
		}
	}
	for _, v := range fx.Visits {
		at, err := time.Parse(time.RFC3339, v.Time)
		if err != nil {
			t.Fatal(err)
		}
		code, ok := transitionCodes[v.Transition]
		if !ok {
			t.Fatalf("unknown transition %q", v.Transition)
		}
		if _, err := db.Exec(`INSERT INTO urls VALUES(?,?,?)`, v.ID, v.URL, v.Title); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`INSERT INTO visits VALUES(?,?,?,0,?,0)`, v.ID, v.ID, history.ToWebKit(at), code); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	ps, err := history.ResolvePath(dir)
	if err != nil || len(ps) != 1 {
		t.Fatalf("resolve: %v %v", ps, err)
	}
	ts := newTS(New(ps, fstest.MapFS{"index.html": {Data: []byte("hi")}}))
	defer ts.Close()
	_, m := get(t, ts, "/api/profiles", "")
	id := m["profiles"].([]any)[0].(map[string]any)["id"].(string)

	for _, c := range fx.Cases {
		t.Run(c.Name, func(t *testing.T) {
			if c.ServerUnsupported {
				t.Skip("server API has no such filter")
			}
			q := url.Values{"profile": {id}, "tz": {"UTC"}, "limit": {"1000"}}
			f := c.Filter
			for k, v := range map[string]string{"start": f.Start, "end": f.End, "q": f.Text, "domain": f.Domain} {
				if v != "" {
					q.Set(k, v)
				}
			}
			if len(f.Categories) > 0 {
				q.Set("category", strings.Join(f.Categories, ","))
			}
			if f.Hide {
				q.Set("maskFlagged", "true")
			}
			code, resp := get(t, ts, "/api/timeline?"+q.Encode(), "")
			if code != http.StatusOK {
				t.Fatalf("status %d: %v", code, resp)
			}
			got := []int64{}
			for _, v := range resp["visits"].([]any) {
				got = append(got, int64(v.(map[string]any)["id"].(float64)))
			}
			sort.Slice(got, func(i, j int) bool { return got[i] < got[j] })
			want := c.Want
			if c.Known != nil {
				want = c.Known.Server
			}
			if want == nil {
				want = []int64{}
			}
			if len(got) != len(want) {
				t.Fatalf("got %v, want %v", got, want)
			}
			for i := range got {
				if got[i] != want[i] {
					t.Fatalf("got %v, want %v", got, want)
				}
			}
		})
	}
}
