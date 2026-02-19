// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DemoUSD} from "../src/DemoUSD.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {DiligencePortal} from "../src/DiligencePortal.sol";
import {RWAComplianceReceiver} from "../src/RWAComplianceReceiver.sol";
import {RWAVault} from "../src/RWAVault.sol";
import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";
import {ReputationRegistry} from "../src/erc8004/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/erc8004/ValidationRegistry.sol";

contract Deploy is Script {
    address internal constant ERC8004_SEPOLIA_IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address internal constant ERC8004_SEPOLIA_REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address internal constant ERC8004_MAINNET_IDENTITY_REGISTRY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address internal constant ERC8004_MAINNET_REPUTATION_REGISTRY = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;

    struct DeployConfig {
        uint256 deployerKey;
        address deployer;
        uint256 agentRegistrarKey;
        address agentRegistrar;
        uint256 agentRegistrarFundingWei;
        address reportForwarder;
        bytes32 expectedWorkflowId;
        address expectedAuthor;
        bytes10 expectedWorkflowName;
        address easContract;
        bytes32 easSchemaUid;
        bool easRevocable;
        uint256 seedAmount;
        bool useOfficialERC8004;
        address identityRegistryAddress;
        address reputationRegistryAddress;
        address validationRegistryAddress;
        bool registerERC8004Agents;
        uint256 reputationAgentId;
        uint256 validationAgentId;
        address validationResponder;
        bool validationAutoRespond;
        string reputationAgentUri;
        string validationAgentUri;
    }

    struct DeployArtifacts {
        DemoUSD asset;
        ComplianceRegistry registry;
        RWAComplianceReceiver receiver;
        RWAVault vault;
        DiligencePortal portal;
        IdentityRegistry identityRegistry;
        ReputationRegistry reputationRegistry;
        ValidationRegistry validationRegistry;
        uint256 reputationAgentId;
        uint256 validationAgentId;
    }

    function run() external {
        DeployConfig memory cfg = _readConfig();

        vm.startBroadcast(cfg.deployerKey);
        DeployArtifacts memory out = _deploy(cfg);
        vm.stopBroadcast();

        _print(cfg, out);
    }

    function _readConfig() internal returns (DeployConfig memory cfg) {
        cfg.deployerKey = vm.envUint("PRIVATE_KEY");
        cfg.deployer = vm.addr(cfg.deployerKey);
        cfg.agentRegistrarKey =
            vm.envOr("AGENT_REGISTRAR_PRIVATE_KEY", uint256(keccak256("RWA_AGENT_REGISTRAR_PRIVATE_KEY_V1")));
        cfg.agentRegistrar = vm.addr(cfg.agentRegistrarKey);
        cfg.agentRegistrarFundingWei = vm.envOr("AGENT_REGISTRAR_FUNDING_WEI", uint256(0.02 ether));
        cfg.reportForwarder = vm.envOr("CRE_REPORT_FORWARDER", address(0));
        cfg.expectedWorkflowId = vm.envOr("CRE_WORKFLOW_ID", bytes32(0));
        cfg.expectedAuthor = vm.envOr("CRE_WORKFLOW_AUTHOR", address(0));
        cfg.expectedWorkflowName = bytes10(vm.envOr("CRE_WORKFLOW_NAME", bytes32(0)));
        cfg.easContract = vm.envOr("EAS_ATTESTATION_CONTRACT", address(0));
        cfg.easSchemaUid = vm.envOr("EAS_SCHEMA_UID", bytes32(0));
        cfg.easRevocable = vm.envOr("EAS_REVOCABLE", true);
        cfg.seedAmount = vm.envOr("SEED_AMOUNT", uint256(1_000_000e6));
        cfg.useOfficialERC8004 = vm.envOr("USE_OFFICIAL_ERC8004", false);
        cfg.identityRegistryAddress = vm.envOr("ERC8004_IDENTITY_REGISTRY", address(0));
        cfg.reputationRegistryAddress = vm.envOr("ERC8004_REPUTATION_REGISTRY", address(0));
        cfg.validationRegistryAddress = vm.envOr("ERC8004_VALIDATION_REGISTRY", address(0));
        cfg.registerERC8004Agents = vm.envOr("REGISTER_ERC8004_AGENTS", true);
        cfg.reputationAgentId = vm.envOr("ERC8004_REPUTATION_AGENT_ID", uint256(0));
        cfg.validationAgentId = vm.envOr("ERC8004_VALIDATION_AGENT_ID", uint256(0));
        cfg.validationResponder = vm.envOr("ERC8004_VALIDATION_RESPONDER", address(0));
        cfg.validationAutoRespond = vm.envOr("ERC8004_VALIDATION_AUTO_RESPOND", true);
        cfg.reputationAgentUri = vm.envOr("REPUTATION_AGENT_URI", string(""));
        cfg.validationAgentUri = vm.envOr("VALIDATION_AGENT_URI", string(""));

        if (cfg.useOfficialERC8004) {
            if (block.chainid == 11155111 || block.chainid == 84532) {
                // Ethereum Sepolia & Base Sepolia share the same official addresses
                cfg.identityRegistryAddress = ERC8004_SEPOLIA_IDENTITY_REGISTRY;
                cfg.reputationRegistryAddress = ERC8004_SEPOLIA_REPUTATION_REGISTRY;
            } else if (block.chainid == 1 || block.chainid == 8453) {
                cfg.identityRegistryAddress = ERC8004_MAINNET_IDENTITY_REGISTRY;
                cfg.reputationRegistryAddress = ERC8004_MAINNET_REPUTATION_REGISTRY;
            }
        }
    }

    function _deploy(DeployConfig memory cfg) internal returns (DeployArtifacts memory out) {
        out.asset = new DemoUSD(cfg.deployer, "Demo USD", "dUSD", 6);
        out.registry = new ComplianceRegistry(cfg.deployer, cfg.deployer);
        out.receiver = new RWAComplianceReceiver(
            cfg.deployer,
            out.registry,
            cfg.reportForwarder,
            cfg.expectedWorkflowId,
            cfg.expectedAuthor,
            cfg.expectedWorkflowName
        );

        if (cfg.easContract != address(0) && cfg.easSchemaUid != bytes32(0)) {
            out.receiver.setEAS(cfg.easContract, cfg.easSchemaUid, cfg.easRevocable);
        }

        out.registry.setWorkflowOperator(address(out.receiver));
        out.vault = new RWAVault(out.asset, out.registry, "RWA Vault Share", "RWAV");
        out.portal = new DiligencePortal();

        if (cfg.identityRegistryAddress == address(0)) {
            out.identityRegistry = new IdentityRegistry();
        } else {
            out.identityRegistry = IdentityRegistry(cfg.identityRegistryAddress);
        }

        if (cfg.reputationRegistryAddress == address(0)) {
            out.reputationRegistry = new ReputationRegistry();
            out.reputationRegistry.initialize(address(out.identityRegistry));
        } else {
            out.reputationRegistry = ReputationRegistry(cfg.reputationRegistryAddress);
        }

        if (cfg.validationRegistryAddress == address(0)) {
            out.validationRegistry = new ValidationRegistry();
            out.validationRegistry.initialize(address(out.identityRegistry));
        } else {
            out.validationRegistry = ValidationRegistry(cfg.validationRegistryAddress);
        }

        if (cfg.registerERC8004Agents) {
            _registerERC8004Agents(cfg, out);
        } else {
            out.reputationAgentId = cfg.reputationAgentId;
            out.validationAgentId = cfg.validationAgentId;
        }

        if (address(out.reputationRegistry) != address(0)) {
            // valueDecimals=1: raw value -500..+1000 maps to -50..+100 on 8004scan (e.g. 850 → 85/100)
            out.receiver.setERC8004Reputation(address(out.reputationRegistry), out.reputationAgentId, 1);
        }

        if (address(out.validationRegistry) != address(0)) {
            address responder = cfg.validationResponder;
            if (responder == address(0) && cfg.validationAutoRespond) {
                responder = address(out.receiver);
            }
            out.receiver.setERC8004Validation(
                address(out.validationRegistry), out.validationAgentId, responder, cfg.validationAutoRespond
            );
        }

        out.asset.mint(cfg.deployer, cfg.seedAmount);
    }

    function _registerERC8004Agents(DeployConfig memory cfg, DeployArtifacts memory out) internal {
        require(cfg.agentRegistrar != address(0), "AGENT_REGISTRAR_ZERO");
        require(cfg.agentRegistrar.code.length == 0, "AGENT_REGISTRAR_MUST_BE_EOA");

        uint256 registrarBalance = cfg.agentRegistrar.balance;
        if (registrarBalance < cfg.agentRegistrarFundingWei) {
            (bool funded,) = payable(cfg.agentRegistrar).call{value: cfg.agentRegistrarFundingWei - registrarBalance}("");
            require(funded, "AGENT_REGISTRAR_FUNDING_FAILED");
        }

        // Build proper ERC-8004 JSON metadata URIs for each agent
        string memory repUri = bytes(cfg.reputationAgentUri).length > 0
            ? cfg.reputationAgentUri
            : _buildReputationAgentUri();
        string memory valUri = bytes(cfg.validationAgentUri).length > 0
            ? cfg.validationAgentUri
            : _buildValidationAgentUri();

        vm.stopBroadcast();
        vm.startBroadcast(cfg.agentRegistrarKey);
        out.reputationAgentId = _registerAgent(out.identityRegistry, repUri);
        out.validationAgentId = _registerAgent(out.identityRegistry, valUri);
        // NOTE: do NOT approve(receiver, validationAgentId) here — that would make the receiver
        // an operator of the validation agent, causing ReputationRegistry.giveFeedback() to
        // revert with SelfFeedbackNotAllowed. The validation agent gets reputation feedback
        // recorded on-chain (visible on 8004scan) via the giveFeedback path in the receiver.
        vm.stopBroadcast();
        vm.startBroadcast(cfg.deployerKey);
    }

    /// @dev Build a data URI with ERC-8004 registration-v1 JSON for the reputation agent.
    function _buildReputationAgentUri() internal pure returns (string memory) {
        // 8004scan expects: type, name, description, protocol, endpoints, active, supportedTrust
        string memory json = '{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1",'
            '"name":"RWA Diligence Reputation Agent",'
            '"description":"Chainlink CRE-powered reputation agent for the Confidential RWA Due-Diligence Vault. Records on-chain reputation feedback after processing KYB verification, AI risk assessment, and compliance decisions for real-world asset tokenization.",'
            '"protocol":"chainlink-cre",'
            '"endpoints":[{"name":"web","endpoint":"https://github.com/arunabha003/Chainlink-Convergence"},{"name":"x402","endpoint":"http://127.0.0.1:3001/kyb","version":"1.0","skills":["kyb-verification","risk-assessment","compliance"],"domains":["rwa","defi","compliance"]}],'
            '"x402Support":true,'
            '"active":true,'
            '"supportedTrust":["reputation"]}';
        return string.concat("data:application/json;base64,", vm.toBase64(bytes(json)));
    }

    /// @dev Build a data URI with ERC-8004 registration-v1 JSON for the validation agent.
    function _buildValidationAgentUri() internal pure returns (string memory) {
        string memory json = '{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1",'
            '"name":"RWA Diligence Validation Agent",'
            '"description":"Chainlink CRE-powered validation agent for the Confidential RWA Due-Diligence Vault. Issues on-chain validation requests and auto-responses after compliance decisions, tracking the full audit trail of KYB and AI risk assessments.",'
            '"protocol":"chainlink-cre",'
            '"endpoints":[{"name":"web","endpoint":"https://github.com/arunabha003/Chainlink-Convergence"},{"name":"x402","endpoint":"http://127.0.0.1:3001/kyb","version":"1.0","skills":["validation","compliance-audit","risk-tracking"],"domains":["rwa","defi","compliance"]}],'
            '"x402Support":true,'
            '"active":true,'
            '"supportedTrust":["reputation","validation"]}';
        return string.concat("data:application/json;base64,", vm.toBase64(bytes(json)));
    }

    function _registerAgent(IdentityRegistry identityRegistry, string memory agentUri) internal returns (uint256 agentId) {
        if (bytes(agentUri).length == 0) {
            return identityRegistry.register();
        }
        return identityRegistry.register(agentUri);
    }

    function _print(DeployConfig memory cfg, DeployArtifacts memory out) internal {
        console2.log("Deployer:", cfg.deployer);
        console2.log("ERC8004 AgentRegistrar:", cfg.agentRegistrar);
        console2.log("USE_OFFICIAL_ERC8004:", cfg.useOfficialERC8004);
        console2.log("CREReportForwarder:", cfg.reportForwarder);
        console2.logBytes32(cfg.expectedWorkflowId);
        console2.log("ExpectedAuthor:", cfg.expectedAuthor);
        console2.logBytes32(bytes32(cfg.expectedWorkflowName));
        console2.log("DemoUSD:", address(out.asset));
        console2.log("ComplianceRegistry:", address(out.registry));
        console2.log("RWAComplianceReceiver:", address(out.receiver));
        console2.log("RWAVault:", address(out.vault));
        console2.log("DiligencePortal:", address(out.portal));
        console2.log("ERC8004 IdentityRegistry:", address(out.identityRegistry));
        console2.log("ERC8004 ReputationRegistry:", address(out.reputationRegistry));
        console2.log("ERC8004 ValidationRegistry:", address(out.validationRegistry));
        console2.log("ERC8004 ReputationAgentId:", out.reputationAgentId);
        console2.log("ERC8004 ValidationAgentId:", out.validationAgentId);
        console2.log("EAS Attestation Contract:", cfg.easContract);
        console2.logBytes32(cfg.easSchemaUid);
    }
}
