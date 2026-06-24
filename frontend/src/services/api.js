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

export default client;
