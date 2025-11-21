package utils

import (
	"log/slog"
	"strconv"
)

func MustParseSlogLevel(level string) slog.Leveler {
	switch level {
	case "DEBUG":
		return slog.LevelDebug
	case "INFO":
		return slog.LevelInfo
	case "WARN":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		levelInt, err := strconv.Atoi(level)
		if err != nil {
			panic(err)
		}

		return slog.Level(levelInt)
	}
}
