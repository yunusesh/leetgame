package llm

import (
	"context"
	"strings"
)

const (
	msgPrefix = `{"message": "`
	endMarker = `", "stage"`
)

type extractState int

const (
	stateBefore  extractState = iota // waiting to see the message prefix
	stateMessage                     // inside the message value, forwarding tokens
	stateAfter                       // past the message value, discarding
)

// Extractor pulls the clean message value out of a streaming JSON response.
// The LLM emits {"message": "CONTENT", "stage": "VALUE"} token by token.
// It calls onToken only with characters that belong to CONTENT.
type Extractor struct {
	accumulated string
	pending     string // trailing buffer to detect end marker before forwarding
	state       extractState
	onToken     func(string)
}

func NewExtractor(onToken func(string)) *Extractor {
	return &Extractor{onToken: onToken}
}

// Add feeds the next token into the extractor.
func (e *Extractor) Add(tok string) {
	e.accumulated += tok
	if e.state == stateAfter {
		return
	}
	if e.state == stateBefore {
		// skip leading code fence (```json\n or ```\n) before looking for JSON prefix
		content := e.accumulated
		if strings.HasPrefix(content, "```") {
			if idx := strings.Index(content, "\n"); idx >= 0 {
				content = content[idx+1:]
			}
		}
		if strings.HasPrefix(content, msgPrefix) {
			e.state = stateMessage
			after := content[len(msgPrefix):]
			if after != "" {
				e.forward(after)
			}
		}
		return
	}
	e.forward(tok)
}

// Flush emits any trailing buffered content. Call after the stream ends.
func (e *Extractor) Flush(ctx context.Context) {
	if e.state == stateMessage && e.pending != "" && e.onToken != nil && ctx.Err() == nil {
		e.onToken(e.pending)
		e.pending = ""
	}
}

// forward sends tok through the trailing buffer so the end marker is always
// detected before any part of it is forwarded to onToken.
func (e *Extractor) forward(tok string) {
	combined := e.pending + tok
	if idx := strings.Index(combined, endMarker); idx >= 0 {
		if e.onToken != nil && idx > 0 {
			e.onToken(combined[:idx])
		}
		e.state = stateAfter
		e.pending = ""
		return
	}
	safeLen := len(combined) - len(endMarker) + 1
	if safeLen > 0 {
		if e.onToken != nil {
			e.onToken(combined[:safeLen])
		}
		e.pending = combined[safeLen:]
	} else {
		e.pending = combined
	}
}

// StripCodeFence removes an opening ```json or ``` fence and its closing ``` from s.
func StripCodeFence(s string) string {
	if !strings.HasPrefix(s, "```") {
		return s
	}
	if idx := strings.Index(s, "\n"); idx >= 0 {
		s = s[idx+1:]
	} else {
		// fence with no newline — strip the opening marker directly
		s = strings.TrimPrefix(s, "```json")
		s = strings.TrimPrefix(s, "```")
	}
	if idx := strings.LastIndex(s, "```"); idx >= 0 {
		s = strings.TrimSpace(s[:idx])
	}
	return s
}
