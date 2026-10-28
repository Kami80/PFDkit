// Each browser page has its own editor. Account writes belong to AccountAutosave;
// the guest store must not compete for the same document or fork its identity.
let accountDocumentId: string | null = null;

export function setAccountDocumentScope(id: string | null) {
  accountDocumentId = id;
}

export function isAccountDocument(id: string) {
  return id === accountDocumentId;
}
