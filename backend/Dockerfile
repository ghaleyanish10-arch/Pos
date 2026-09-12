FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/api ./cmd/server

FROM alpine:3.20
RUN adduser -D -H appuser
WORKDIR /app
COPY --from=build /bin/api /app/api
COPY migrations /app/migrations
USER appuser
EXPOSE 8080
ENTRYPOINT ["/app/api"]