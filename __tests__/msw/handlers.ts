import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("/api/upload", () =>
    HttpResponse.json({ imageId: "test-img-id", s3Url: "https://s3.example.com/test.jpg" })
  ),
  http.get("/api/detect/:imageId", () =>
    HttpResponse.json({
      imageId: "test-img-id",
      detections: [],
      totalValueRange: null,
      recyclers: [],
      passportUrl: null,
      passportId: null,
      agentStreamUrl: "/agent/test-img-id/stream",
    })
  ),
  http.get("/api/admin/queue", () =>
    HttpResponse.json({ items: [], total: 0 })
  ),
];
