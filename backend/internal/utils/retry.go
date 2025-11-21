package utils

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type NonRetryableError struct {
	Err error
}

func (nre *NonRetryableError) Error() string {
	return fmt.Sprintf("non retryable error: %s", nre.Err.Error())
}

const (
	retries       int           = 2
	retryInterval time.Duration = 100 * time.Millisecond
)

func Retry[T any](ctx context.Context, fn func(ctx context.Context) (T, error)) (T, error) {
	var zero T
	var joinedErr error

	for i := range retries {
		result, err := fn(ctx)
		if err == nil {
			return result, nil
		}

		if nre, ok := err.(*NonRetryableError); ok {
			return zero, nre.Err
		}

		joinedErr = errors.Join(joinedErr, err)
		if i < retries-1 {
			select {
			case <-ctx.Done():
				return zero, ctx.Err()
			case <-time.After(retryInterval):
			}
		}
	}

	return zero, joinedErr
}

func CreateNonRetryableError(err error) *NonRetryableError {
	return &NonRetryableError{
		Err: err,
	}
}
