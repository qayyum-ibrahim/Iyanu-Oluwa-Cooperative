import { createMemoryStore } from "../src/memory-store.js";
import { runStoreContract } from "./helpers/store-contract.js";

// A fresh, empty store for every test.
runStoreContract("in-memory adapter", () => createMemoryStore());