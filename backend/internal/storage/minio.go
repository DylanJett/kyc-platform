package storage

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOClient struct {
	client *minio.Client
	bucket string
}

func NewMinIO() (*MinIOClient, error) {
	endpoint  := os.Getenv("MINIO_ENDPOINT")
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	bucket    := os.Getenv("MINIO_BUCKET")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		return nil, err
	}

	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if err = client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, err
		}
	}

	return &MinIOClient{client: client, bucket: bucket}, nil
}

func (m *MinIOClient) Upload(file multipart.File, header *multipart.FileHeader, appID string) (string, error) {
	path := fmt.Sprintf("%s/%d_%s", appID, time.Now().UnixNano(), header.Filename)

	_, err := m.client.PutObject(
		context.Background(),
		m.bucket,
		path,
		file,
		header.Size,
		minio.PutObjectOptions{ContentType: header.Header.Get("Content-Type")},
	)
	if err != nil {
		return "", err
	}
	return path, nil
}

// GetObject — возвращает файл напрямую из MinIO
func (m *MinIOClient) GetObject(path string) (*minio.Object, *minio.ObjectInfo, error) {
	obj, err := m.client.GetObject(context.Background(), m.bucket, path, minio.GetObjectOptions{})
	if err != nil {
		return nil, nil, err
	}
	info, err := obj.Stat()
	if err != nil {
		return nil, nil, err
	}
	return obj, &info, nil
}

// GetURL — оставляем для совместимости, но не используем
func (m *MinIOClient) GetURL(path string) (string, error) {
	url, err := m.client.PresignedGetObject(context.Background(), m.bucket, path, time.Hour, nil)
	if err != nil {
		return "", err
	}
	return url.String(), nil
}

// StreamTo — стримит файл в writer
func (m *MinIOClient) StreamTo(path string, w io.Writer) (string, int64, error) {
	obj, info, err := m.GetObject(path)
	if err != nil {
		return "", 0, err
	}
	defer obj.Close()
	n, err := io.Copy(w, obj)
	return info.ContentType, n, err
}