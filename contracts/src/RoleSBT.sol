// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";

/// @title RoleSBT
/// @notice An ERC-5192 compliant Soulbound Token for RBAC
contract RoleSBT is ERC721, Ownable, IERC5192 {
    error ErrSoulboundNonTransferable();

    constructor(address initialOwner) ERC721("RoleSBT", "RSBT") Ownable(initialOwner) {}

    /// @notice Returns the locking status of an Soulbound Token.
    /// @dev Always returns true since all tokens are non-transferable.
    function locked(uint256 /* tokenId */) external pure returns (bool) {
        return true;
    }

    /// @notice Mints a new soulbound token to the specified address.
    /// @param to The address to mint the token to.
    /// @param tokenId The identifier for the token.
    function mint(address to, uint256 tokenId) external onlyOwner {
        _mint(to, tokenId);
        emit Locked(tokenId);
    }

    /// @notice Burns the specified token.
    /// @param tokenId The identifier for the token to burn.
    function burn(uint256 tokenId) external {
        address auth = _msgSender();
        _requireOwned(tokenId);
        if (auth != ownerOf(tokenId) && getApproved(tokenId) != auth && !isApprovedForAll(ownerOf(tokenId), auth)) {
            revert ERC721InsufficientApproval(auth, tokenId);
        }
        _burn(tokenId);
    }

    /// @inheritdoc ERC721
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Prevent transfer if it's not minting (from == 0) and not burning (to == 0)
        if (from != address(0) && to != address(0)) {
            revert ErrSoulboundNonTransferable();
        }

        return super._update(to, tokenId, auth);
    }

    /// @inheritdoc ERC721
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }
}
