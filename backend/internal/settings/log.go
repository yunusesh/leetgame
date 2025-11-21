package settings

type Log struct {
	Level string `env:"LEVEL" envDefault:"INFO"`
}
