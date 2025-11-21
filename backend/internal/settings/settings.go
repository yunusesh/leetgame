package settings

import "github.com/caarlos0/env/v11"

type Settings struct {
	Storage Storage `envPrefix:"STORAGE_"`
	Server  Server  `envPrefix:"SERVER_"`
	Log     Log     `envPrefix:"LOG_"`
}

func Load() (Settings, error) {
	return env.ParseAs[Settings]()
}
