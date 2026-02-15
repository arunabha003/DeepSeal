// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @notice ERC-8004 Identity Registry (ERC-721 + URIStorage + optional metadata + agentWallet verification).
/// Spec: https://ercs.ethereum.org/ERCS/erc-8004
contract IdentityRegistry is ERC721URIStorage, EIP712 {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );

    error NotAuthorized(address caller, uint256 agentId);
    error ReservedKey(string key);
    error DeadlineExpired(uint256 deadline);
    error InvalidSignature();

    bytes32 private constant _SET_AGENT_WALLET_TYPEHASH =
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");

    uint256 public nextAgentId = 1;

    mapping(uint256 agentId => mapping(bytes32 keyHash => bytes value)) private _metadata;
    mapping(uint256 agentId => address wallet) private _agentWallet;

    constructor() ERC721("ERC-8004 Agent Identity", "AGENT") EIP712("ERC-8004 Identity Registry", "1") {}

    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, agentURI);
        _setReservedAgentWallet(agentId, msg.sender);

        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, agentURI);
        _setReservedAgentWallet(agentId, msg.sender);
    }

    function register() external returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, "");
        _setReservedAgentWallet(agentId, msg.sender);
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        _requireApprovedOrOwner(msg.sender, agentId);
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory) {
        return _metadata[agentId][_keyHash(metadataKey)];
    }

    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external {
        _requireApprovedOrOwner(msg.sender, agentId);
        _setMetadata(agentId, metadataKey, metadataValue);
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallet[agentId];
    }

    function unsetAgentWallet(uint256 agentId) external {
        _requireApprovedOrOwner(msg.sender, agentId);
        _unsetAgentWallet(agentId);
    }

    /// @notice Set the payment-receiving wallet for the agent, proving control of `newWallet`.
    /// @dev The caller must be owner or approved operator for `agentId`.
    /// The signature must be produced by `newWallet` over an EIP-712 typed message.
    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external {
        _requireApprovedOrOwner(msg.sender, agentId);
        if (block.timestamp > deadline) revert DeadlineExpired(deadline);

        bytes32 structHash = keccak256(abi.encode(_SET_AGENT_WALLET_TYPEHASH, agentId, newWallet, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);

        if (!_isValidWalletSignature(newWallet, digest, signature)) revert InvalidSignature();

        _setReservedAgentWallet(agentId, newWallet);
    }

    function _mintAgent(address owner_, string memory agentURI) internal returns (uint256 agentId) {
        agentId = nextAgentId++;
        _safeMint(owner_, agentId);
        if (bytes(agentURI).length != 0) {
            _setTokenURI(agentId, agentURI);
        }
        emit Registered(agentId, agentURI, owner_);
    }

    function _setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) internal {
        if (_isReservedAgentWalletKey(metadataKey)) revert ReservedKey(metadataKey);

        bytes32 h = _keyHash(metadataKey);
        _metadata[agentId][h] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function _setReservedAgentWallet(uint256 agentId, address wallet) internal {
        _agentWallet[agentId] = wallet;
        _metadata[agentId][_keyHash("agentWallet")] = abi.encode(wallet);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(wallet));
    }

    function _unsetAgentWallet(uint256 agentId) internal {
        _agentWallet[agentId] = address(0);
        _metadata[agentId][_keyHash("agentWallet")] = abi.encode(address(0));
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(address(0)));
    }

    function _requireApprovedOrOwner(address caller, uint256 agentId) internal view {
        if (!_isApprovedOrOwner(caller, agentId)) revert NotAuthorized(caller, agentId);
    }

    function _isApprovedOrOwner(address caller, uint256 agentId) internal view returns (bool) {
        address owner_ = ownerOf(agentId);
        return (caller == owner_ || isApprovedForAll(owner_, caller) || getApproved(agentId) == caller);
    }

    function _isValidWalletSignature(address wallet, bytes32 digest, bytes calldata signature) internal view returns (bool) {
        if (wallet.code.length == 0) {
            address recovered = ECDSA.recover(digest, signature);
            return recovered == wallet;
        }
        (bool ok, bytes memory ret) = wallet.staticcall(
            abi.encodeCall(IERC1271.isValidSignature, (digest, signature))
        );
        return ok && ret.length == 32 && bytes4(ret) == IERC1271.isValidSignature.selector;
    }

    function _isReservedAgentWalletKey(string memory k) internal pure returns (bool) {
        return keccak256(bytes(k)) == keccak256(bytes("agentWallet"));
    }

    function _keyHash(string memory k) internal pure returns (bytes32) {
        return keccak256(bytes(k));
    }

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721) returns (address) {
        address from = super._update(to, tokenId, auth);
        if (from != address(0) && from != to) {
            _unsetAgentWallet(tokenId);
        }
        return from;
    }

    function tokenURI(uint256 tokenId) public view override(ERC721URIStorage) returns (string memory) {
        return ERC721URIStorage.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage) returns (bool) {
        return ERC721URIStorage.supportsInterface(interfaceId);
    }
}

