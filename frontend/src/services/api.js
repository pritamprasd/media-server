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

export async function listDuplicates(type = "exact") {
  const { data } = await client.get("/duplicates", { params: { type } });
  return data;
}

export async function getNearDuplicates(fileId) {
  const { data } = await client.get(`/files/${fileId}/near-duplicates`);
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
  if (filters.hasAi) params.has_ai = true;
  if (filters.tag) params.tag = filters.tag;
  if (filters.sortBy) params.sort_by = filters.sortBy;
  if (filters.sortDir) params.sort_dir = filters.sortDir;
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

export async function uploadFiles(files, nickname, directory, onProgress) {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  form.append("nickname", nickname);
  if (directory) form.append("directory", directory);
  const { data } = await client.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress,
    timeout: 300000,
  });
  return data;
}

export async function listUploadDirs(prefix) {
  const { data } = await client.get("/upload/directories", { params: { prefix } });
  return data;
}

export async function createUploadDir(path) {
  const { data } = await client.post("/upload/directories", { path });
  return data;
}

export async function getStats() {
  const { data } = await client.get("/stats");
  return data;
}

export async function listNicknames() {
  const { data } = await client.get("/upload/nicknames");
  return data;
}

export async function listTags() {
  const { data } = await client.get("/tags");
  return data;
}

export async function softDeleteFiles(fileIds) {
  const { data } = await client.post("/upload/files/delete", { file_ids: fileIds });
  return data;
}

export async function softDeleteDir(path) {
  const { data } = await client.post("/upload/directories/delete", { path });
  return data;
}

export async function moveUploadItems(paths, target) {
  const { data } = await client.post("/upload/move", { paths, target });
  return data;
}

export async function copyUploadItems(paths, target) {
  const { data } = await client.post("/upload/copy", { paths, target });
  return data;
}

export async function renameUploadItem(path, newName) {
  const { data } = await client.post("/upload/rename", { path, new_name: newName });
  return data;
}

export async function listRecentFiles(prefix) {
  const { data } = await client.get("/upload/files/recent", { params: { prefix } });
  return data;
}

export async function listFilesWithGps(page = 1, perPage = 200) {
  const { data } = await client.get("/files/with-gps", { params: { page, per_page: perPage } });
  return data;
}

export async function listLocations() {
  const { data } = await client.get("/locations");
  return data;
}

export async function createLocation(payload) {
  const { data } = await client.post("/locations", payload);
  return data;
}

export async function updateLocation(id, payload) {
  const { data } = await client.put(`/locations/${id}`, payload);
  return data;
}

export async function deleteLocation(id) {
  const { data } = await client.delete(`/locations/${id}`);
  return data;
}

export async function regenerateAiMetadata(fileId) {
  const { data } = await client.post(`/files/${fileId}/regenerate-ai`);
  return data;
}

export async function regenerateExif(fileId) {
  const { data } = await client.post(`/files/${fileId}/regenerate-exif`);
  return data;
}

export async function regenerateThumbnail(fileId) {
  const { data } = await client.post(`/files/${fileId}/regenerate-thumbnail`);
  return data;
}

export async function listFilters() {
  const { data } = await client.get("/filters");
  return data;
}

export async function createFilter(payload) {
  const { data } = await client.post("/filters", payload);
  return data;
}

export async function deleteFilter(filterId) {
  const { data } = await client.delete(`/filters/${filterId}`);
  return data;
}

export async function listPersons() {
  const { data } = await client.get("/persons");
  return data;
}

export async function updatePerson(personId, payload) {
  const { data } = await client.put(`/persons/${personId}`, payload);
  return data;
}

export async function deletePerson(personId) {
  const { data } = await client.delete(`/persons/${personId}`);
  return data;
}

export async function listPersonFaces(personId, page = 1, perPage = 12) {
  const { data } = await client.get(`/persons/${personId}/faces`, {
    params: { page, per_page: perPage },
  });
  return data;
}

export async function listPersonFiles(personId, page = 1, perPage = 32) {
  const { data } = await client.get(`/persons/${personId}/files`, {
    params: { page, per_page: perPage },
  });
  return data;
}

export async function scanAllFaces() {
  const { data } = await client.post("/persons/scan");
  return data;
}

export async function detectFaces(fileId) {
  const { data } = await client.post(`/files/${fileId}/detect-faces`);
  return data;
}

export async function listFaces(personId, page = 1, perPage = 50) {
  const params = { page, per_page: perPage };
  if (personId != null) params.person_id = personId;
  const { data } = await client.get("/faces", { params });
  return data;
}

export async function getFaceStats() {
  const { data } = await client.get("/faces/stats");
  return data;
}

export async function listFileFaces(fileId) {
  const { data } = await client.get(`/files/${fileId}/faces`);
  return data;
}

export async function mergePersons(personIds, name) {
  const { data } = await client.post("/persons/merge", { person_ids: personIds, name });
  return data;
}

export async function updateFace(faceId, payload) {
  const { data } = await client.put(`/faces/${faceId}`, payload);
  return data;
}

export async function exportFile(fileId, operations, opts = {}) {
  const { data } = await client.post(`/files/${fileId}/export`, { operations, ...opts }, { responseType: "blob" });
  return data;
}

export default client;
