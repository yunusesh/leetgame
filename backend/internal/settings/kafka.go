package settings

type Kafka struct {
	BrokerURL    string `env:"BROKER_URL"    envDefault:""`
	Topic        string `env:"TOPIC"         envDefault:"session_completed"`
	GroupID      string `env:"GROUP_ID"      envDefault:"evaluator"`
	TLS          bool   `env:"TLS"           envDefault:"false"`
	SASLUser     string `env:"SASL_USER"     envDefault:""`
	SASLPassword string `env:"SASL_PASSWORD" envDefault:""`
}
