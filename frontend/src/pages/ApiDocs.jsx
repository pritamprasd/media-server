export default function ApiDocs() {
  return (
    <div className="apidocs">
      <iframe
        className="apidocs__frame"
        src="/api/docs"
        title="API Docs (Swagger UI)"
      />
    </div>
  );
}
