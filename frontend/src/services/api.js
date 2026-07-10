import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  timeout: 120000,
  headers: { "Content-Type": "application/json" },
});

let airplaneMode = false;

export function setAirplaneMode(v) { airplaneMode = v; }
export function getAirplaneMode() { return airplaneMode; }

client.interceptors.request.use((config) => {
  if (airplaneMode) {
    config.headers["X-Airplane-Mode"] = "1";
  }
  return config;
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

export async function getFile(fileId) {
  const { data } = await client.get(`/files/${fileId}`);
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

export async function updateFileMetadata(fileId, payload) {
  const { data } = await client.patch(`/files/${fileId}/metadata`, payload);
  return data;
}

export async function regenerateAiMetadata(fileId) {
  if (airplaneMode) return { skipped: true, reason: "airplane_mode" };
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

export async function listPersons(page = 1, perPage = 50, q = "") {
  const params = { page, per_page: perPage };
  if (q) params.q = q;
  const { data } = await client.get("/persons", { params });
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

export async function listPersonFiles(personId, page = 1, perPage = 15) {
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

export async function getPersonTimeline(personId, timeframe = "year", dateFrom, dateTo, personIds, personGroups) {
  const params = { timeframe };
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  if (personGroups && personGroups.length > 0) {
    params.person_groups = JSON.stringify(personGroups);
  } else if (personIds && personIds.length > 0) {
    params.person_ids = personIds.join(",");
  }
  const { data } = await client.get(`/persons/${personId}/timeline`, { params });
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

export async function exportVideo(fileId, operations, opts = {}) {
  const { data } = await client.post(`/files/${fileId}/export-video`, { operations, ...opts }, { responseType: "blob" });
  return data;
}

export async function reverseGeocode(lat, lng) {
  if (airplaneMode) return { skipped: true, reason: "airplane_mode" };
  const { data } = await client.get("/geocode/reverse", { params: { lat, lng } });
  return data;
}

export async function explorerBrowse(prefix, page = 1) {
  const { data } = await client.get("/explorer/browse", { params: { prefix, page } });
  return data;
}

export async function explorerRename(path, newName, itemType) {
  const { data } = await client.post("/explorer/rename", { path, new_name: newName, type: itemType });
  return data;
}

export async function explorerMove(paths, target) {
  const { data } = await client.post("/explorer/move", { paths, target });
  return data;
}

export async function explorerCopy(paths, target) {
  const { data } = await client.post("/explorer/copy", { paths, target });
  return data;
}

export async function explorerDelete(paths) {
  const { data } = await client.post("/explorer/delete", { paths });
  return data;
}

export async function explorerListFavorites() {
  const { data } = await client.get("/explorer/favorites");
  return data;
}

export async function explorerAddFavorite(path, name) {
  const { data } = await client.post("/explorer/favorites", { path, name });
  return data;
}

export async function explorerRemoveFavorite(path) {
  const { data } = await client.delete("/explorer/favorites", { params: { path } });
  return data;
}

export async function toggleHidden(fileId) {
  const { data } = await client.patch(`/files/${fileId}/toggle-hidden`);
  return data;
}

export async function listHiddenFiles(page = 1, perPage = 50, filters = {}, pin, signal) {
  const params = { page, per_page: perPage };
  if (filters.mimeGroup) params.mime_group = filters.mimeGroup;
  if (filters.q) params.q = filters.q;
  if (filters.sortBy) params.sort_by = filters.sortBy;
  if (filters.sortDir) params.sort_dir = filters.sortDir;
  const { data } = await client.get("/files/hidden", {
    params,
    headers: { "X-Hidden-Pin": pin },
    signal,
  });
  return data;
}

export async function verifyHiddenPin(pin) {
  const { data } = await client.post("/files/verify-hidden-pin", {}, {
    headers: { "X-Hidden-Pin": pin },
  });
  return data;
}

export async function unhideFiles(fileIds, pin) {
  const { data } = await client.post("/files/unhide", { file_ids: fileIds }, {
    headers: { "X-Hidden-Pin": pin },
  });
  return data;
}

export async function listCollections() {
  const { data } = await client.get("/collections");
  return data;
}

export async function getCollection(id) {
  const { data } = await client.get(`/collections/${id}`);
  return data;
}

export async function createCollection(payload) {
  const { data } = await client.post("/collections", payload);
  return data;
}

export async function updateCollection(id, payload) {
  const { data } = await client.put(`/collections/${id}`, payload);
  return data;
}

export async function deleteCollection(id) {
  const { data } = await client.delete(`/collections/${id}`);
  return data;
}

export async function addFilesToCollection(id, fileIds) {
  const { data } = await client.post(`/collections/${id}/files`, { file_ids: fileIds });
  return data;
}

export async function removeFilesFromCollection(id, fileIds) {
  const { data } = await client.delete(`/collections/${id}/files`, { data: { file_ids: fileIds } });
  return data;
}

export default client;
