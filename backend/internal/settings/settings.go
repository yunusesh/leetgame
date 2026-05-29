package settings

import "github.com/caarlos0/env/v11"

type Settings struct {
	Storage Storage `envPrefix:"STORAGE_"`
	Server  Server  `envPrefix:"SERVER_"`
	Log     Log     `envPrefix:"LOG_"`
	LLM     LLM     `envPrefix:"LLM_"`
	Auth    Auth    `envPrefix:"AUTH_"`
}

func Load() (Settings, error) {
	return env.ParseAs[Settings]()
}
