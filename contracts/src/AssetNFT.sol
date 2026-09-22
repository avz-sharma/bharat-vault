// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessManaged} from "@openzeppelin/contracts/access/manager/AccessManaged.sol";

/// @title AssetNFT
/// @notice An ERC-721 Managed Asset token for the platform
contract AssetNFT is ERC721, AccessManaged {
    mapping(uint256 => string) private _assetURIs;

    constructor(address initialAuthority) 
        ERC721("AssetNFT", "ANFT") 
        AccessManaged(initialAuthority) 
    {}

    /// @notice Restricted mint function for authorized accounts.
    /// @param to The address to mint the asset to.
    /// @param assetId The identifier for the asset.
    /// @param ipfsHash The IPFS hash representing the asset's metadata.
    function mintAsset(address to, uint256 assetId, string calldata ipfsHash) external restricted {
        _mint(to, assetId);
        _assetURIs[assetId] = ipfsHash;
    }

    /// @notice Returns the URI for a given asset ID.
    /// @param tokenId The identifier of the asset.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _assetURIs[tokenId];
    }
}
