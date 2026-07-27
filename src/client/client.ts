// HulyClient — thin wrapper @hcengineering/api-client (ws + rest).
// Design: 04-system.md §6 (reconciled T-05 với api-client@0.7.423 real API).
//
// Transport toggle (D3):
//   ws   = connect() persistent + full CRUD via PlatformClient
//   rest = connectRest() + createRestTxOperations() (RestClient read-only + TxOperations cho write)
//
// getCurrentUser() wrap client.getAccount() (D15 FR-18 default assignee).
// Error mapping: delegate sang T-04 HulyError qua mapError.

import {
  connect,
  connectRest,
  createRestTxOperations,
  getWorkspaceToken,
  type Account,
  type AuthOptions,
  type ConnectOptions,
  type AttachedData,
  type AttachedDoc,
  type Class,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type FindResult,
  type Mixin,
  type MixinData,
  type PlatformClient,
  type Ref,
  type RestClient,
  type Space,
  type TxOperations,
  type TxResult,
  type WithLookup,
  type WithMarkup,
} from "@hcengineering/api-client";
import { mapError, type HulyError } from "./errors.js";

/** Transport global toggle (D3). Default 'ws'. */
export type Transport = "ws" | "rest";

/** Huly credentials: url tách + auth union (D8) + workspace BẮT BUỘC. */
export type HulyCredentials = {
  url: string;
} & AuthOptions;

/** Current user shape (mapped từ Account, D15 FR-18). */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

/**
 * HulyClient — unified interface cho cả ws + rest transport.
 * Methods ủy quyền PlatformClient (ws) hoặc RestClient + TxOperations (rest).
 */
export interface HulyClient {
  readonly transport: Transport;

  // FindOperations
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

  // DocOperations (write)
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

  // CollectionOperations (cho comments/labels/relations)
  addCollection<T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: WithMarkup<AttachedData<P>>,
    id?: Ref<P>,
  ): Promise<Ref<P>>;

  // MixinOperations
  createMixin<D extends Doc, M extends D>(
    objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: WithMarkup<MixinData<D, M>>,
  ): Promise<TxResult>;

  // Account
  getAccount(): Promise<Account>;
  getCurrentUser(): Promise<CurrentUser>;

  // Lifecycle
  close(): Promise<void>;
}

/**
 * Create HulyClient theo transport (D3):
 *   ws   → connect() + delegate PlatformClient
 *   rest → connectRest() + createRestTxOperations() + delegate RestClient (read) + TxOperations (write)
 *
 * Throws HulyError nếu connect/connectRest/createRestTxOperations fail (mapError từ T-04).
 */
export async function createHulyClient(
  creds: HulyCredentials,
  transport: Transport = "ws",
): Promise<HulyClient> {
  try {
    const { url, ...auth } = creds;
    if (transport === "ws") {
      const client = await connect(url, auth as ConnectOptions);
      return makeWsClient(client);
    }
    // rest
    const rest = await connectRest(url, auth as AuthOptions);
    const { endpoint, workspaceId, token } = await getWorkspaceToken(url, auth as AuthOptions);
    const tx = await createRestTxOperations(endpoint, workspaceId, token);
    return makeRestClient(rest, tx);
  } catch (e) {
    throw mapError(e) as HulyError;
  }
}

/** Wrap PlatformClient (ws) thành HulyClient. */
function makeWsClient(client: PlatformClient): HulyClient {
  let cachedUser: CurrentUser | undefined;
  return {
    transport: "ws",
    findOne: (...args) => client.findOne(...args),
    findAll: (...args) => client.findAll(...args),
    createDoc: (...args) => client.createDoc(...args),
    updateDoc: (...args) => client.updateDoc(...args),
    removeDoc: (...args) => client.removeDoc(...args),
    addCollection: (...args) => client.addCollection(...args),
    createMixin: (...args) => client.createMixin(...args),
    getAccount: () => client.getAccount(),
    async getCurrentUser(): Promise<CurrentUser> {
      if (cachedUser) return cachedUser;
      const account = await client.getAccount();
      cachedUser = accountToUser(account);
      return cachedUser;
    },
    close: () => client.close(),
  };
}

/** Wrap RestClient + TxOperations (rest) thành HulyClient. */
function makeRestClient(rest: RestClient, tx: TxOperations): HulyClient {
  let cachedUser: CurrentUser | undefined;
  return {
    transport: "rest",
    // Read ops → RestClient
    findOne: (...args) => rest.findOne(...args),
    findAll: (...args) => rest.findAll(...args),
    // Write ops → TxOperations (RestClient read-only)
    createDoc: (...args) => tx.createDoc(...args),
    updateDoc: (...args) => tx.updateDoc(...args),
    removeDoc: (...args) => tx.removeDoc(...args),
    addCollection: (...args) => tx.addCollection(...args),
    createMixin: (...args) => tx.createMixin(...args),
    getAccount: () => rest.getAccount(),
    async getCurrentUser(): Promise<CurrentUser> {
      if (cachedUser) return cachedUser;
      const account = await rest.getAccount();
      cachedUser = accountToUser(account);
      return cachedUser;
    },
    // REST stateless — close no-op
    close: async () => {},
  };
}

/** Map Account → CurrentUser (D15 FR-18 assignee default). */
function accountToUser(account: Account): CurrentUser {
  return {
    id: account.uuid,
    name: account.primarySocialId,
    email: account.primarySocialId,
  };
}
