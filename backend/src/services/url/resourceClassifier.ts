import { ResourceType } from "./types";

const FILE_PATTERN =
  /\.(?:7z|bin|csv|docx?|exe|gz|iso|pdf|pkg|rar|tar|txt|xlsx?|zip)(?:$|[?#])/i;
const API_HOST_PATTERN = /^(?:api|graphql|rest|service|services)\./i;
const API_PATH_PATTERN = /\/(?:api|graphql|rest|v\d+)(?:\/|$)|\/bot[^/]+\//i;

export function classifyResourceType(url: URL): ResourceType {
  if (FILE_PATTERN.test(`${url.pathname}${url.search}`)) return "FILE_DOWNLOAD";
  if (
    API_HOST_PATTERN.test(url.hostname) ||
    API_PATH_PATTERN.test(url.pathname)
  )
    return "API_ENDPOINT";
  if (url.protocol === "http:" || url.protocol === "https:") return "WEB_PAGE";
  return "UNKNOWN_RESOURCE";
}
