package settings

type Claude struct {
	APIKey string `env:"API_KEY,required"`
	Model  string `env:"MODEL" envDefault:"claude-haiku-4-5-20251001"`
}
