package kafka

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"

	kafkago "github.com/segmentio/kafka-go"
	"github.com/segmentio/kafka-go/sasl/scram"
)

type Producer struct {
	writer *kafkago.Writer
}

func NewProducer(brokerURL, topic, saslUser, saslPass string, useTLS bool) (*Producer, error) {
	transport := &kafkago.Transport{}
	if useTLS {
		transport.TLS = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	if saslUser != "" {
		mechanism, err := scram.Mechanism(scram.SHA256, saslUser, saslPass)
		if err != nil {
			return nil, fmt.Errorf("failed to create SASL mechanism: %w", err)
		}
		transport.SASL = mechanism
	}

	w := &kafkago.Writer{
		Addr:      kafkago.TCP(brokerURL),
		Topic:     topic,
		Balancer:  &kafkago.LeastBytes{},
		Transport: transport,
	}
	return &Producer{writer: w}, nil
}

func (p *Producer) PublishSessionCompleted(ctx context.Context, event SessionCompletedEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}
	return p.writer.WriteMessages(ctx, kafkago.Message{Value: data})
}

func (p *Producer) Close() error {
	return p.writer.Close()
}
