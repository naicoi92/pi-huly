// Ambient declarations cho @hcengineering/* packages.
// Packages publish chỉ `lib/*.js` (KHÔNG `.d.ts`) — TS không resolve types.
// Đây là minimal type surface cho pi-huly client.ts (T-05).
//
// Real runtime API verified từ installed packages (evidence-collector):
//   connect(url, options): Promise<PlatformClient>
//   connectRest(url, options): Promise<RestClient>
//   createRestTxOperations(endpoint, workspaceId, token): Promise<TxOperations>
//   getWorkspaceToken(url, options): Promise<{endpoint, workspaceId, token}>
//
// Types: Ref/Doc/Account/TxOperations từ @hcengineering/core.

declare module "@hcengineering/api-client" {
  export type Ref<T> = string & { readonly __ref: T };
  export type AccountUuid = string & { readonly __accountUuid: true };
  export type PersonId = string & { readonly __personId: true };
  export type WorkspaceUuid = string & { readonly __workspaceUuid: true };

  export interface AuthOptions {
    workspace: string;
  }
  export interface TokenAuthOptions extends AuthOptions {
    token: string;
  }
  export interface PasswordAuthOptions extends AuthOptions {
    email: string;
    password: string;
  }
  export type ConnectOptions = TokenAuthOptions | PasswordAuthOptions;

  export interface Account {
    uuid: AccountUuid;
    role: unknown;
    primarySocialId: PersonId;
    socialIds: PersonId[];
    fullSocialIds: unknown[];
  }

  // Minimal Doc/Class/Space types cho HulyClient interface
  export type Space = unknown;
  export type Class<T> = unknown;
  export type Mixin<T> = unknown;
  export type AttachedDoc = Doc;
  export type DocumentQuery<T> = Record<string, unknown>;
  export type DocumentUpdate<T> = Record<string, unknown>;
  export type FindOptions<T> = Record<string, unknown>;
  export type FindResult<T> = T[];
  export type WithLookup<T> = T;
  export type WithMarkup<T> = T;
  export type AttachedData<T> = Record<string, unknown>;
  export type MixinData<D, M> = Record<string, unknown>;
  export type MixinUpdate<D, M> = Record<string, unknown>;
  export type TxResult = unknown;
  export type MarkupRef = string;
  export type MarkupFormat = string;

  export interface Doc {
    _id: string;
    space: string;
    modifiedOn: number;
    modifiedBy: string;
  }

  export interface PlatformClient {
    findOne<T extends Doc>(
      _class: Ref<Class<T>>,
      query: DocumentQuery<T>,
      options?: FindOptions<T>,
    ): Promise<WithLookup<T> | undefined>;
    findAll<T extends Doc>(
      _class: Ref<Class<T>>,
      query: DocumentQuery<T>,
      options?: FindOptions<T>,
    ): Promise<FindResult<T>>;
    createDoc<T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      attributes: WithMarkup<Record<string, unknown>>,
      id?: Ref<T>,
    ): Promise<Ref<T>>;
    updateDoc<T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      objectId: Ref<T>,
      operations: WithMarkup<DocumentUpdate<T>>,
      retrieve?: boolean,
    ): Promise<TxResult>;
    removeDoc<T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      objectId: Ref<T>,
    ): Promise<TxResult>;
    addCollection<T extends Doc, P extends AttachedDoc>(
      _class: Ref<Class<P>>,
      space: Ref<Space>,
      attachedTo: Ref<T>,
      attachedToClass: Ref<Class<T>>,
      collection: string,
      attributes: WithMarkup<AttachedData<P>>,
      id?: Ref<P>,
    ): Promise<Ref<P>>;
    createMixin<D extends Doc, M extends D>(
      objectId: Ref<D>,
      objectClass: Ref<Class<D>>,
      objectSpace: Ref<Space>,
      mixin: Ref<Mixin<M>>,
      attributes: WithMarkup<MixinData<D, M>>,
    ): Promise<TxResult>;
    getAccount(): Promise<Account>;
    close(): Promise<void>;
  }

  export interface RestClient {
    findOne<T extends Doc>(
      _class: Ref<Class<T>>,
      query: DocumentQuery<T>,
      options?: FindOptions<T>,
    ): Promise<WithLookup<T> | undefined>;
    findAll<T extends Doc>(
      _class: Ref<Class<T>>,
      query: DocumentQuery<T>,
      options?: FindOptions<T>,
    ): Promise<FindResult<T>>;
    getAccount(): Promise<Account>;
  }

  export interface WorkspaceToken {
    endpoint: string;
    workspaceId: WorkspaceUuid;
    token: string;
  }

  export interface TxOperations {
    createDoc<T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      attributes: WithMarkup<Record<string, unknown>>,
      id?: Ref<T>,
    ): Promise<Ref<T>>;
    updateDoc<T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      objectId: Ref<T>,
      operations: WithMarkup<DocumentUpdate<T>>,
      retrieve?: boolean,
    ): Promise<TxResult>;
    removeDoc<T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      objectId: Ref<T>,
    ): Promise<TxResult>;
    addCollection<T extends Doc, P extends AttachedDoc>(
      _class: Ref<Class<P>>,
      space: Ref<Space>,
      attachedTo: Ref<T>,
      attachedToClass: Ref<Class<T>>,
      collection: string,
      attributes: WithMarkup<AttachedData<P>>,
      id?: Ref<P>,
    ): Promise<Ref<P>>;
    createMixin<D extends Doc, M extends D>(
      objectId: Ref<D>,
      objectClass: Ref<Class<D>>,
      objectSpace: Ref<Space>,
      mixin: Ref<Mixin<M>>,
      attributes: WithMarkup<MixinData<D, M>>,
    ): Promise<TxResult>;
  }

  export function connect(url: string, options: ConnectOptions): Promise<PlatformClient>;
  export function connectRest(url: string, options: AuthOptions): Promise<RestClient>;
  export function createRestTxOperations(
    endpoint: string,
    workspaceId: string,
    token: string,
    fullModel?: boolean,
  ): Promise<TxOperations>;
  export function getWorkspaceToken(url: string, options: AuthOptions): Promise<WorkspaceToken>;

  // T-75: storage (blob upload/download) — connectStorage lazily.
  export interface StorageClient {
    put(
      objectName: string,
      stream: Readable | Buffer | string,
      contentType: string,
      size?: number,
    ): Promise<{ _id: string; size: number; type?: string }>;
    get(objectName: string): Promise<Readable>;
  }
  export function connectStorage(
    url: string,
    options: AuthOptions,
    config?: unknown,
  ): Promise<StorageClient>;
}

declare module "@hcengineering/core" {
  export type Ref<T> = string & { readonly __ref: T };
  export type AccountUuid = string & { readonly __accountUuid: true };
  export type PersonId = string & { readonly __personId: true };
  export type WorkspaceUuid = string & { readonly __workspaceUuid: true };

  export interface Account {
    uuid: AccountUuid;
    role: unknown;
    primarySocialId: PersonId;
    socialIds: PersonId[];
    fullSocialIds: unknown[];
  }

  export interface Doc {
    _id: string;
    space: string;
    modifiedOn: number;
    modifiedBy: string;
  }

  export type Space = unknown;
  export type Class<T> = unknown;
  export type Mixin<T> = unknown;
  export type AttachedDoc = Doc;
  export type DocumentQuery<T> = Record<string, unknown>;
  export type DocumentUpdate<T> = Record<string, unknown>;
  export type FindOptions<T> = Record<string, unknown>;
  export type FindResult<T> = T[];
  export type WithLookup<T> = T;
  export type WithMarkup<T> = T;
  export type AttachedData<T> = Record<string, unknown>;
  export type MixinData<D, M> = Record<string, unknown>;
  export type TxResult = unknown;

  export interface TxOperations {
    createDoc<T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      attributes: WithMarkup<Record<string, unknown>>,
      id?: Ref<T>,
    ): Promise<Ref<T>>;
    updateDoc<T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      objectId: Ref<T>,
      operations: WithMarkup<DocumentUpdate<T>>,
      retrieve?: boolean,
    ): Promise<TxResult>;
    removeDoc<T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      objectId: Ref<T>,
    ): Promise<TxResult>;
    addCollection<T extends Doc, P extends AttachedDoc>(
      _class: Ref<Class<P>>,
      space: Ref<Space>,
      attachedTo: Ref<T>,
      attachedToClass: Ref<Class<T>>,
      collection: string,
      attributes: WithMarkup<AttachedData<P>>,
      id?: Ref<P>,
    ): Promise<Ref<P>>;
    createMixin<D extends Doc, M extends D>(
      objectId: Ref<D>,
      objectClass: Ref<Class<D>>,
      objectSpace: Ref<Space>,
      mixin: Ref<Mixin<M>>,
      attributes: WithMarkup<MixinData<D, M>>,
    ): Promise<TxResult>;
  }
}

declare module "@hcengineering/text-core" {
  export interface MarkupNode {
    type: string;
    marks?: unknown[];
    content?: unknown[];
    attrs?: Record<string, unknown>;
    text?: string;
    [key: string]: unknown;
  }
}

declare module "@hcengineering/text-markdown" {
  import type { MarkupNode } from "@hcengineering/text-core";

  export interface MarkdownOptions {
    refUrl?: string;
    imageUrl?: string;
  }

  export function markdownToMarkup(markdown: string, options?: MarkdownOptions): MarkupNode;
  export function markupToMarkdown(markup: MarkupNode, options?: MarkdownOptions): string;
}
