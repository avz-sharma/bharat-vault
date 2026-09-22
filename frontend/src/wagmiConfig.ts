import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';
import { injected } from 'wagmi/connectors';

/**
 * Custom Private EVM Chain: Hyperledger Besu (NBFLite / Enterprise IAM)
 * RPC Endpoint: http://127.0.0.1:8545
 * Chain ID: 1337
 */
export const hyperledgerBesu = defineChain({
  id: 1337,
  name: 'Hyperledger Besu',
  nativeCurrency: {
    name: 'Besu ETH',
    symbol: 'BETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
    public: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Besu Local Explorer',
      url: 'http://localhost:26000',
    },
  },
  testnet: true,
});

/**
 * Public Testnet: Polygon Amoy Testnet
 * Chain ID: 80002
 */
export const polygonAmoy = defineChain({
  id: 80002,
  name: 'Polygon Amoy Testnet',
  nativeCurrency: {
    name: 'MATIC',
    symbol: 'MATIC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc-amoy.polygon.technology'],
    },
    public: {
      http: ['https://rpc-amoy.polygon.technology'],
    },
  },
  blockExplorers: {
    default: {
      name: 'PolygonScan Amoy',
      url: 'https://amoy.polygonscan.com',
    },
  },
  testnet: true,
});

/**
 * Wagmi v2 Client Configuration
 * Supports Hyperledger Besu (1337) and Polygon Amoy (80002)
 */
export const wagmiConfig = createConfig({
  chains: [hyperledgerBesu, polygonAmoy],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [hyperledgerBesu.id]: http('http://127.0.0.1:8545'),
    [polygonAmoy.id]: http('https://rpc-amoy.polygon.technology'),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}

/**
 * Default Contract Deployment Addresses
 */
export const CONTRACT_ADDRESSES = {
  besu: {
    roleSBT: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as `0x${string}`,
    assetNFT: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as `0x${string}`,
    accessManager: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as `0x${string}`,
  },
  amoy: {
    roleSBT: '0x1234567890123456789012345678901234567890' as `0x${string}`,
    assetNFT: '0x2345678901234567890123456789012345678901' as `0x${string}`,
    accessManager: '0x3456789012345678901234567890123456789012' as `0x${string}`,
  },
} as const;

/**
 * RoleSBT ABI with ERC-5192, Ownable, and Custom Solidity Errors
 */
export const ROLE_SBT_ABI = [
  // Functions
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'burn',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'locked',
    stateMutability: 'pure',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'supportsInterface',
    stateMutability: 'view',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  // Events
  {
    type: 'event',
    name: 'Locked',
    inputs: [{ name: 'tokenId', type: 'uint256', indexed: false }],
  },
  {
    type: 'event',
    name: 'Unlocked',
    inputs: [{ name: 'tokenId', type: 'uint256', indexed: false }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
  // Custom Errors
  {
    type: 'error',
    name: 'ErrSoulboundNonTransferable',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'error',
    name: 'OwnableInvalidOwner',
    inputs: [{ name: 'owner', type: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC721InsufficientApproval',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ERC721InvalidReceiver',
    inputs: [{ name: 'receiver', type: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC721InvalidSender',
    inputs: [{ name: 'sender', type: 'address' }],
  },
  {
    type: 'error',
    name: 'ERC721NonexistentToken',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
  },
] as const;

/**
 * AssetNFT ABI with AccessManaged and ERC-721
 */
export const ASSET_NFT_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'mintAsset',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'assetId', type: 'uint256' },
      { name: 'ipfsHash', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'authority',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // Custom Errors
  {
    type: 'error',
    name: 'AccessManagedUnauthorized',
    inputs: [{ name: 'caller', type: 'address' }],
  },
  {
    type: 'error',
    name: 'AccessManagedRequiredDelay',
    inputs: [
      { name: 'caller', type: 'address' },
      { name: 'delay', type: 'uint32' },
    ],
  },
] as const;
