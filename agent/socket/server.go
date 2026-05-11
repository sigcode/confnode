package socket

import (
	"encoding/json"
	"log"
	"net"
	"os"

	"github.com/sigcode/confnode/agent/config"
	"github.com/sigcode/confnode/agent/handlers"
)

type Server struct {
	cfg      *config.Config
	listener net.Listener
}

// Request is the JSON envelope sent by the backend over the Unix socket.
type Request struct {
	Cmd    string            `json:"cmd"`
	Params map[string]string `json:"params,omitempty"`
}

// Response is written back to the backend.
type Response struct {
	OK     bool   `json:"ok"`
	Output string `json:"output,omitempty"`
	Error  string `json:"error,omitempty"`
}

func NewServer(cfg *config.Config) (*Server, error) {
	// Remove stale socket file if it exists
	os.Remove(cfg.Agent.Socket)

	l, err := net.Listen("unix", cfg.Agent.Socket)
	if err != nil {
		return nil, err
	}
	// Allow the web user (non-root) to connect
	if err := os.Chmod(cfg.Agent.Socket, 0660); err != nil {
		l.Close()
		return nil, err
	}
	return &Server{cfg: cfg, listener: l}, nil
}

func (s *Server) Listen() error {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			return err
		}
		go s.handle(conn)
	}
}

func (s *Server) Close() {
	s.listener.Close()
	os.Remove(s.cfg.Agent.Socket)
}

func (s *Server) handle(conn net.Conn) {
	defer conn.Close()

	var req Request
	if err := json.NewDecoder(conn).Decode(&req); err != nil {
		writeResp(conn, Response{Error: "invalid JSON: " + err.Error()})
		return
	}

	log.Printf("cmd=%s params=%v", req.Cmd, req.Params)

	output, err := handlers.Dispatch(s.cfg, req.Cmd, req.Params)
	if err != nil {
		writeResp(conn, Response{OK: false, Error: err.Error()})
		return
	}
	writeResp(conn, Response{OK: true, Output: output})
}

func writeResp(conn net.Conn, r Response) {
	json.NewEncoder(conn).Encode(r)
}
