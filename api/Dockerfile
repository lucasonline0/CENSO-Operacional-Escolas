FROM golang:1.24-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /out/censo-api ./cmd/api

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=build /out/censo-api ./censo-api

ENV PORT=8080

EXPOSE 8080

CMD ["./censo-api"]
