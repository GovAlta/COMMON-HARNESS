# Skill: Go File Upload Handling

## Overview

File uploads are handled with defense-in-depth: size limits, MIME allowlist, magic byte validation, UUID rename, and database storage.

## Upload Handler

```go
const maxUploadSize = 10 << 20 // 10MB

var allowedMIMETypes = map[string]bool{
    "image/jpeg":      true,
    "image/png":       true,
    "image/webp":      true,
    "application/pdf": true,
}

// Magic byte signatures for file type validation
var magicBytes = map[string][]byte{
    "image/jpeg":      {0xFF, 0xD8, 0xFF},
    "image/png":       {0x89, 0x50, 0x4E, 0x47},
    "image/webp":      {0x52, 0x49, 0x46, 0x46},
    "application/pdf": {0x25, 0x50, 0x44, 0x46},
}

func UploadFile(w http.ResponseWriter, r *http.Request) {
    // 1. Enforce size limit at HTTP level
    r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

    // 2. Parse multipart form
    if err := r.ParseMultipartForm(maxUploadSize); err != nil {
        utils.SendError(w, utils.BadRequest("File too large (max 10MB)"))
        return
    }

    file, header, err := r.FormFile("file")
    if err != nil {
        utils.SendError(w, utils.BadRequest("No file provided"))
        return
    }
    defer file.Close()

    // 3. Validate MIME type from header
    contentType := header.Header.Get("Content-Type")
    if !allowedMIMETypes[contentType] {
        utils.SendError(w, utils.BadRequest("File type not allowed. Accepted: JPEG, PNG, WEBP, PDF"))
        return
    }

    // 4. Read file into memory
    data, err := io.ReadAll(file)
    if err != nil {
        utils.SendError(w, utils.BadRequest("Failed to read file"))
        return
    }

    // 5. Validate magic bytes (defense-in-depth)
    if !validateMagicBytes(contentType, data) {
        utils.SendError(w, utils.BadRequest("File content does not match declared type"))
        return
    }

    // 6. Generate UUID filename
    ext := filepath.Ext(header.Filename)
    newFilename := uuid.New().String() + ext

    // 7. Store in database
    userID := r.Context().Value("user_id").(string)
    attachment, err := services.StoreFile(r.Context(), services.FileInput{
        Filename:    newFilename,
        OriginalName: header.Filename,
        ContentType: contentType,
        Size:        int64(len(data)),
        Data:        data,
        UploadedBy:  userID,
    })
    if err != nil {
        utils.SendError(w, err)
        return
    }

    utils.SendSuccess(w, http.StatusCreated, attachment)
}

func validateMagicBytes(contentType string, data []byte) bool {
    expected, ok := magicBytes[contentType]
    if !ok {
        return false // Unknown type
    }
    if len(data) < len(expected) {
        return false
    }
    return bytes.Equal(data[:len(expected)], expected)
}
```

## Database Storage

```sql
CREATE TABLE IF NOT EXISTS file_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    data BYTEA NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_file_attachments_entity ON file_attachments(entity_type, entity_id);
```

### Store File Service
```go
func StoreFile(ctx context.Context, input FileInput) (*FileAttachment, error) {
    // Double-check size at service layer (defense-in-depth)
    if input.Size > 10*1024*1024 {
        return nil, utils.BadRequest("File exceeds maximum size")
    }

    var attachment FileAttachment
    err := config.DB.QueryRow(ctx,
        `INSERT INTO file_attachments (filename, original_name, content_type, size, data, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, filename, original_name, content_type, size, created_at`,
        input.Filename, input.OriginalName, input.ContentType, input.Size, input.Data, input.UploadedBy,
    ).Scan(&attachment.ID, &attachment.Filename, &attachment.OriginalName,
        &attachment.ContentType, &attachment.Size, &attachment.CreatedAt)

    if err != nil {
        return nil, fmt.Errorf("storing file: %w", err)
    }

    return &attachment, nil
}
```

### Retrieve File
```go
func GetFile(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        utils.SendError(w, utils.BadRequest("Invalid file ID"))
        return
    }

    var file FileAttachment
    err = config.DB.QueryRow(r.Context(),
        `SELECT filename, content_type, size, data FROM file_attachments WHERE id = $1`,
        id,
    ).Scan(&file.Filename, &file.ContentType, &file.Size, &file.Data)

    if err == pgx.ErrNoRows {
        utils.SendError(w, utils.NotFound("File"))
        return
    }

    w.Header().Set("Content-Type", file.ContentType)
    w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, file.Filename))
    w.Header().Set("Content-Length", strconv.FormatInt(file.Size, 10))
    w.Write(file.Data)
}
```

## Link File to Entity

```go
func LinkFileToEntity(ctx context.Context, fileID, entityID uuid.UUID, entityType string) error {
    _, err := config.DB.Exec(ctx,
        `UPDATE file_attachments SET entity_type = $1, entity_id = $2 WHERE id = $3`,
        entityType, entityID, fileID,
    )
    return err
}
```

## Route Registration

```go
r.Route("/files", func(r chi.Router) {
    r.Use(middleware.Authenticate(cfg))
    r.Post("/", controllers.UploadFile)
    r.Get("/{id}", controllers.GetFile)
    r.Delete("/{id}", controllers.DeleteFile)
})
```

## Security Checklist

- [ ] Size limit enforced at HTTP level (`http.MaxBytesReader`)
- [ ] Size limit enforced at service level (defense-in-depth)
- [ ] MIME type validated against allowlist
- [ ] Magic bytes validated against declared MIME type
- [ ] Filename replaced with UUID (prevents path traversal)
- [ ] File stored in database, never written to filesystem
- [ ] Authenticated users only (middleware enforced)
- [ ] Audit log entry on upload/delete
