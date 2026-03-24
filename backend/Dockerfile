FROM golang:1.22-alpine AS builder

# Install tesseract dev headers for gosseract CGO build
RUN apk add --no-cache tesseract-ocr-dev gcc g++ musl-dev leptonica-dev

WORKDIR /app

COPY . .
RUN go mod tidy
RUN CGO_ENABLED=1 go build -o server ./cmd/api

FROM alpine:latest

# Install tesseract runtime + English language data
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng

WORKDIR /app
COPY --from=builder /app/server .

EXPOSE 8080
CMD ["./server"]
