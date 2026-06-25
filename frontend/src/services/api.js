import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  timeout: 120000,
  headers: { "Content-Type": "application/json" },
});

export async function getStatus() {
  const { data } = await client.get("/status");
  return data;
}

export async function browseFs(path = "") {
  const { data } = await client.get("/browse-fs", { params: { path } });
  return data;
}

export async function importFolder(path, groups) {
  const { data } = await client.post("/import", { path, groups });
  return data;
}

export async function listSessions() {
  const { data } = await client.get("/sessions");
  return data;
}

export async function browseSession(sessionId, path = "") {
  const { data } = await client.get(`/sessions/${sessionId}/browse`, {
    params: { path },
  });
  return data;
}

export async function toggleFavorite(fileId) {
  const { data } = await client.patch(`/files/${fileId}/favorite`);
  return data;
}

export async function listFavorites() {
  const { data } = await client.get("/favorites");
  return data;
}

export async function getFileMetadata(fileId) {
  const { data } = await client.get(`/files/${fileId}/metadata`);
  return data;
}

export async function getFileThumbnail(fileId) {
  const { data } = await client.get(`/files/${fileId}/thumbnail`);
  return data;
}

export async function listDirectories() {
  const { data } = await client.get("/directories");
  return data;
}

export async function listFiles(page = 1, perPage = 50, filters = {}, signal) {
  const params = { page, per_page: perPage };
  if (filters.mimeGroup) params.mime_group = filters.mimeGroup;
  if (filters.q) params.q = filters.q;
  if (filters.directoryId) params.directory_id = filters.directoryId;
  if (filters.minWidth != null) params.min_width = filters.minWidth;
  if (filters.minHeight != null) params.min_height = filters.minHeight;
  const { data } = await client.get("/files", { params, signal });
  return data;
}

export async function updateTags(fileId, tags) {
  const { data } = await client.patch(`/files/${fileId}/tags`, { tags });
  return data;
}

export async function editFile(fileId, operations) {
  const { data } = await client.post(`/files/${fileId}/edit`, { operations });
  return data;
}

export async function deleteFile(fileId, deleteStorage = false) {
  const { data } = await client.delete(`/files/${fileId}`, {
    data: { delete_storage: deleteStorage },
  });
  return data;
}

export default client;
