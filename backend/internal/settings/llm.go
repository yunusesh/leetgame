package settings

type LLM struct {
	Provider  string `env:"PROVIDER" envDefault:"anthropic"`
	APIKey    string `env:"API_KEY"`
	Model     string `env:"MODEL" envDefault:"claude-haiku-4-5"`
	OllamaURL string `env:"OLLAMA_URL" envDefault:"http://localhost:11434"`
}
