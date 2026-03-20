package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"kyc-platform/internal/auth"
	"kyc-platform/internal/db"
	"kyc-platform/internal/merchant"
	"kyc-platform/internal/reviewer"
	"kyc-platform/internal/storage"
)

func main() {
	database, err := db.Connect()
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer database.Close()

	store, err := storage.NewMinIO()
	if err != nil {
		log.Fatalf("Failed to connect to MinIO: %v", err)
	}

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/api/auth/register", auth.Register(database))
	r.POST("/api/auth/login", auth.Login(database))

	api := r.Group("/api", auth.Middleware())
	{
		// Merchant routes
		api.GET("/application", merchant.GetMyApplication(database))
		api.GET("/application/list", merchant.GetMyApplications(database))
		api.POST("/application", merchant.CreateApplication(database))
		api.PUT("/application", merchant.UpdateApplication(database))
		api.PUT("/application/:id", merchant.UpdateApplicationByID(database))
		api.POST("/application/submit", merchant.SubmitApplication(database))
		api.POST("/application/:id/submit", merchant.SubmitApplicationByID(database))
		api.POST("/application/documents", merchant.UploadDocument(database, store))
		api.POST("/application/:id/documents", merchant.UploadDocumentForApp(database, store))
		api.POST("/application/:id/owners", merchant.AddOwner(database))
		api.DELETE("/application/:id/owners/:ownerId", merchant.DeleteOwner(database))
		api.GET("/application/:id/owners", merchant.GetOwners(database))

		// Reviewer routes
		api.GET("/applications", reviewer.ListApplications(database))
		api.GET("/applications/:id", reviewer.GetApplication(database))
		api.POST("/applications/:id/review", reviewer.ReviewApplication(database))
		api.GET("/documents/:docId/url", reviewer.GetDocumentURL(database, store))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server started on :%s", port)
	r.Run(":" + port)
}
