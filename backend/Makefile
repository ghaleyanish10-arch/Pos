.PHONY: run build migrate clean

APP_NAME := mesa-os-api

build:
	go build -o bin/$(APP_NAME) ./cmd/server

run:
	go run ./cmd/server

migrate:
	go run ./cmd/server

test:
	go test ./...

lint:
	golangci-lint run ./...

clean:
	rm -rf bin/

deps:
	go mod tidy
	go mod download

help:
	@echo "Available targets:"
	@echo "  build   - Build the binary"
	@echo "  run     - Run the server"
	@echo "  test    - Run tests"
	@echo "  lint    - Run linter"
	@echo "  clean   - Remove build artifacts"
	@echo "  deps    - Download dependencies"
