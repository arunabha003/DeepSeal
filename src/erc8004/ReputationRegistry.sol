// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.24;

/// Spec: https://ercs.ethereum.org/ERCS/erc-8004
interface IIdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

contract ReputationRegistry {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
        bool exists;
    }

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );

    error NotInitialized();
    error AlreadyInitialized();
    error InvalidIdentityRegistry(address identityRegistry);
    error ValueDecimalsOutOfRange(uint8 valueDecimals);
    error SelfFeedbackNotAllowed(address clientAddress);
    error ClientAddressesRequired();
    error InvalidAgentId(uint256 agentId);

    IIdentityRegistry private _identityRegistry;

    mapping(uint256 agentId => address[] clients) private _clients;
    mapping(uint256 agentId => mapping(address client => bool seen)) private _seenClient;

    mapping(uint256 agentId => mapping(address client => uint64 lastIndex)) private _lastIndex;
    mapping(uint256 agentId => mapping(address client => mapping(uint64 idx => Feedback fb))) private _feedback;

    mapping(bytes32 feedbackKey => uint64 total) private _responseCount;
    mapping(bytes32 feedbackKey => mapping(address responder => uint64 count)) private _responseCountByResponder;

    function initialize(address identityRegistry_) external {
        if (address(_identityRegistry) != address(0)) revert AlreadyInitialized();
        if (identityRegistry_ == address(0)) revert InvalidIdentityRegistry(identityRegistry_);
        _identityRegistry = IIdentityRegistry(identityRegistry_);
    }

    function getIdentityRegistry() external view returns (address identityRegistry) {
        identityRegistry = address(_identityRegistry);
        if (identityRegistry == address(0)) revert NotInitialized();
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        address identity = address(_identityRegistry);
        if (identity == address(0)) revert NotInitialized();
        if (valueDecimals > 18) revert ValueDecimalsOutOfRange(valueDecimals);

        address owner = _ownerOf(agentId);
        if (owner == address(0)) revert InvalidAgentId(agentId);

        if (msg.sender == owner || _identityRegistry.getApproved(agentId) == msg.sender || _identityRegistry.isApprovedForAll(owner, msg.sender)) {
            revert SelfFeedbackNotAllowed(msg.sender);
        }

        uint64 next = _lastIndex[agentId][msg.sender] + 1;
        _lastIndex[agentId][msg.sender] = next;

        _feedback[agentId][msg.sender][next] = Feedback({
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            isRevoked: false,
            exists: true
        });

        if (!_seenClient[agentId][msg.sender]) {
            _seenClient[agentId][msg.sender] = true;
            _clients[agentId].push(msg.sender);
        }

        emit NewFeedback(agentId, msg.sender, next, value, valueDecimals, tag1, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        Feedback storage fb = _feedback[agentId][msg.sender][feedbackIndex];
        // If it doesn't exist, it will appear as zero; revoking a non-existing feedback is a no-op revert.
        require(_existsFeedback(fb), "feedback does not exist");
        fb.isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        Feedback storage fb = _feedback[agentId][clientAddress][feedbackIndex];
        require(_existsFeedback(fb), "feedback does not exist");

        bytes32 key = _feedbackKey(agentId, clientAddress, feedbackIndex);
        _responseCount[key] += 1;
        _responseCountByResponder[key][msg.sender] += 1;

        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        if (clientAddresses.length == 0) revert ClientAddressesRequired();

        bytes32 t1 = keccak256(bytes(tag1));
        bytes32 t2 = keccak256(bytes(tag2));
        bool filter1 = bytes(tag1).length != 0;
        bool filter2 = bytes(tag2).length != 0;

        int256 sumScaled = 0;
        uint256 matched = 0;

        for (uint256 i = 0; i < clientAddresses.length; i++) {
            address c = clientAddresses[i];
            uint64 last = _lastIndex[agentId][c];
            for (uint64 idx = 1; idx <= last; idx++) {
                Feedback storage fb = _feedback[agentId][c][idx];
                if (!_existsFeedback(fb)) continue;
                if (fb.isRevoked) continue;
                if (filter1 && keccak256(bytes(fb.tag1)) != t1) continue;
                if (filter2 && keccak256(bytes(fb.tag2)) != t2) continue;

                int256 v = int256(fb.value);
                int256 scaled = v * int256(10 ** (18 - uint256(fb.valueDecimals)));
                sumScaled += scaled;
                matched++;
            }
        }

        if (matched == 0) return (0, 0, 18);

        int256 avgScaled = sumScaled / int256(matched);

        count = uint64(matched);
        summaryValueDecimals = 18;
        // Bound to int128 for return type
        if (avgScaled > type(int128).max) summaryValue = type(int128).max;
        else if (avgScaled < type(int128).min) summaryValue = type(int128).min;
        else summaryValue = int128(avgScaled);
    }

    function readFeedback(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex
    ) external view returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked) {
        Feedback storage fb = _feedback[agentId][clientAddress][feedbackIndex];
        require(_existsFeedback(fb), "feedback does not exist");
        return (fb.value, fb.valueDecimals, fb.tag1, fb.tag2, fb.isRevoked);
    }

    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    )
        external
        view
        returns (
            address[] memory clients,
            uint64[] memory feedbackIndexes,
            int128[] memory values,
            uint8[] memory valueDecimals,
            string[] memory tag1s,
            string[] memory tag2s,
            bool[] memory revokedStatuses
        )
    {
        bytes32 t1 = keccak256(bytes(tag1));
        bytes32 t2 = keccak256(bytes(tag2));
        bool filter1 = bytes(tag1).length != 0;
        bool filter2 = bytes(tag2).length != 0;

        address[] memory useClients;
        if (clientAddresses.length == 0) {
            address[] storage stored = _clients[agentId];
            useClients = new address[](stored.length);
            for (uint256 i = 0; i < stored.length; i++) {
                useClients[i] = stored[i];
            }
        } else {
            useClients = new address[](clientAddresses.length);
            for (uint256 i = 0; i < clientAddresses.length; i++) {
                useClients[i] = clientAddresses[i];
            }
        }

        uint256 totalCount = 0;
        for (uint256 i = 0; i < useClients.length; i++) {
            address c = useClients[i];
            uint64 last = _lastIndex[agentId][c];
            for (uint64 idx = 1; idx <= last; idx++) {
                Feedback storage fb = _feedback[agentId][c][idx];
                if (!_existsFeedback(fb)) continue;
                if (!includeRevoked && fb.isRevoked) continue;
                if (filter1 && keccak256(bytes(fb.tag1)) != t1) continue;
                if (filter2 && keccak256(bytes(fb.tag2)) != t2) continue;
                totalCount++;
            }
        }

        clients = new address[](totalCount);
        feedbackIndexes = new uint64[](totalCount);
        values = new int128[](totalCount);
        valueDecimals = new uint8[](totalCount);
        tag1s = new string[](totalCount);
        tag2s = new string[](totalCount);
        revokedStatuses = new bool[](totalCount);

        uint256 k = 0;
        for (uint256 i = 0; i < useClients.length; i++) {
            address c = useClients[i];
            uint64 last = _lastIndex[agentId][c];
            for (uint64 idx = 1; idx <= last; idx++) {
                Feedback storage fb = _feedback[agentId][c][idx];
                if (!_existsFeedback(fb)) continue;
                if (!includeRevoked && fb.isRevoked) continue;
                if (filter1 && keccak256(bytes(fb.tag1)) != t1) continue;
                if (filter2 && keccak256(bytes(fb.tag2)) != t2) continue;

                clients[k] = c;
                feedbackIndexes[k] = idx;
                values[k] = fb.value;
                valueDecimals[k] = fb.valueDecimals;
                tag1s[k] = fb.tag1;
                tag2s[k] = fb.tag2;
                revokedStatuses[k] = fb.isRevoked;
                k++;
            }
        }
    }

    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external view returns (uint64 count) {
        bytes32 key = _feedbackKey(agentId, clientAddress, feedbackIndex);
        if (responders.length == 0) return _responseCount[key];
        uint64 sum = 0;
        for (uint256 i = 0; i < responders.length; i++) {
            sum += _responseCountByResponder[key][responders[i]];
        }
        return sum;
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return _lastIndex[agentId][clientAddress];
    }

    function getVersion() external pure returns (string memory) {
        return "2.0.0";
    }

    function _ownerOf(uint256 agentId) internal view returns (address owner) {
        try _identityRegistry.ownerOf(agentId) returns (address o) {
            owner = o;
        } catch {
            owner = address(0);
        }
    }

    function _feedbackKey(uint256 agentId, address clientAddress, uint64 feedbackIndex) internal pure returns (bytes32) {
        return keccak256(abi.encode(agentId, clientAddress, feedbackIndex));
    }

    function _existsFeedback(Feedback storage fb) internal view returns (bool) {
        return fb.exists;
    }
}
