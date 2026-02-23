// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ComplianceRegistry} from "./ComplianceRegistry.sol";
import {RWAVault} from "./RWAVault.sol";

contract RWAVaultFactory is Ownable {
    IERC20 public immutable assetToken;
    ComplianceRegistry public immutable complianceRegistry;

    address public operator;

    mapping(bytes32 assetId => address vault) public vaultByAssetId;

    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event VaultCreated(bytes32 indexed assetId, address indexed vault, string name, string symbol);

    error ZeroAddress();
    error Unauthorized(address caller);
    error InvalidAssetId();

    constructor(address initialOwner, IERC20 assetToken_, ComplianceRegistry complianceRegistry_, address initialOperator)
        Ownable(initialOwner)
    {
        if (address(assetToken_) == address(0) || address(complianceRegistry_) == address(0)) revert ZeroAddress();
        assetToken = assetToken_;
        complianceRegistry = complianceRegistry_;
        _setOperator(initialOperator);
    }

    function setOperator(address newOperator) external onlyOwner {
        _setOperator(newOperator);
    }

    function createVault(bytes32 assetId, string calldata name, string calldata symbol) external returns (address vault) {
        _requireOwnerOrOperator();
        if (assetId == bytes32(0)) revert InvalidAssetId();
        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidAssetId();

        vault = vaultByAssetId[assetId];
        if (vault != address(0)) {
            return vault;
        }

        RWAVault created = new RWAVault(assetToken, complianceRegistry, name, symbol);
        vault = address(created);
        vaultByAssetId[assetId] = vault;

        emit VaultCreated(assetId, vault, name, symbol);
    }

    function _setOperator(address newOperator) internal {
        if (newOperator == address(0)) revert ZeroAddress();
        address previous = operator;
        operator = newOperator;
        emit OperatorUpdated(previous, newOperator);
    }

    function _requireOwnerOrOperator() internal view {
        address caller = msg.sender;
        if (caller != owner() && caller != operator) revert Unauthorized(caller);
    }
}
