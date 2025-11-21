package settings

type Server struct {
	Port     string `env:"PORT" envDefault:"42069"`
	LogLevel string `env:"LOG_LEVEL" envDefault:"INFO"`
}
