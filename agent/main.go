package main

import (
	"encoding/json"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/sigcode/confnode/agent/config"
	"github.com/sigcode/confnode/agent/socket"
)

func main() {
	configPath := flag.String("config", "/etc/configurator/config.yaml", "path to config.yaml")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	log.Printf("configurator-agent starting (socket: %s)", cfg.Agent.Socket)

	srv, err := socket.NewServer(cfg)
	if err != nil {
		log.Fatalf("failed to create socket server: %v", err)
	}

	go func() {
		if err := srv.Listen(); err != nil {
			log.Fatalf("socket server error: %v", err)
		}
	}()

	// Log startup as JSON for the backend to parse
	json.NewEncoder(os.Stdout).Encode(map[string]string{"status": "ready"})

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	<-sig

	log.Println("shutting down")
	srv.Close()
}
