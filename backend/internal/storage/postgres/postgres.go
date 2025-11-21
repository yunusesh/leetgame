package postgres

import (
	"context"
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	Pool *pgxpool.Pool
}

type Config struct {
	DbUrl string
}

func New(cfg *Config) *Postgres {
	poolConfig, err := pgxpool.ParseConfig(cfg.DbUrl)
	if err != nil {
		slog.Error(
			"pgxpool failed to parse config",
			slog.String("err", err.Error()),
		)
		os.Exit(1)
	}

	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		slog.Error(
			"failed to create new pool",
			slog.String("err", err.Error()),
		)
		os.Exit(1)
	}

	if err := pool.Ping(context.TODO()); err != nil {
		slog.Error(
			"failed to ping database",
			slog.String("err", err.Error()),
		)
		os.Exit(1)
	}

	return &Postgres{
		Pool: pool,
	}
}

func (p *Postgres) Ping(ctx context.Context) error {
	return p.Pool.Ping(ctx)
}
