// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {IEAS} from "../src/interfaces/IEAS.sol";

contract EASAttest is Script {
    function run() external returns (bytes32 uid) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address eas = vm.envAddress("EAS_ATTESTATION_CONTRACT");

        bytes32 schemaUid = vm.envBytes32("EAS_SCHEMA_UID");
        address recipient = vm.envAddress("EAS_RECIPIENT");

        address subject = vm.envAddress("SUBJECT");
        bool approved = vm.envBool("APPROVED");
        uint256 riskScoreRaw = vm.envUint("RISK_SCORE");
        bytes32 attestationHash = vm.envBytes32("ATTESTATION_HASH");

        require(riskScoreRaw <= type(uint32).max, "RISK_SCORE too large");
        uint32 riskScore = uint32(riskScoreRaw);

        // EAS schema must match this encoding:
        // (address subject, bool approved, uint32 riskScore, bytes32 attestationHash, uint64 timestamp)
        bytes memory data = abi.encode(subject, approved, riskScore, attestationHash, uint64(block.timestamp));

        IEAS.AttestationRequestData memory reqData = IEAS.AttestationRequestData({
            recipient: recipient,
            expirationTime: 0,
            revocable: true,
            refUID: bytes32(0),
            data: data,
            value: 0
        });

        IEAS.AttestationRequest memory req = IEAS.AttestationRequest({schema: schemaUid, data: reqData});

        vm.startBroadcast(key);
        uid = IEAS(eas).attest(req);
        vm.stopBroadcast();

        console2.log("EAS:", eas);
        console2.logBytes32(schemaUid);
        console2.log("Recipient:", recipient);
        console2.log("Subject:", subject);
        console2.log("Approved:", approved);
        console2.log("RiskScore:", riskScore);
        console2.logBytes32(attestationHash);
        console2.logBytes32(uid);
    }
}

