# Socket.IO Implementation Guide for Flutter

## Overview
This guide provides complete implementation details for integrating with the Wurkify App API Socket.IO messaging system using Flutter.

## Table of Contents
- [Server Configuration](#server-configuration)
- [Flutter Dependencies](#flutter-dependencies)
- [Socket Events & Emits](#socket-events--emits)
- [Flutter Implementation](#flutter-implementation)
- [Testing Guide](#testing-guide)
- [Troubleshooting](#troubleshooting)

---

## Server Configuration

**WebSocket URL:** `ws://your-server-url:5000/socket.io/?EIO=4&transport=websocket`

**Ping Settings:**
- `pingTimeout`: 60000ms (60 seconds)
- `pingInterval`: 25000ms (25 seconds)

**Server Events Available:**
- User authentication & joining
- Group management
- Real-time messaging notifications
- Keep-alive ping/pong
- Connection testing

---

## Flutter Dependencies

Add to your `pubspec.yaml`:

```yaml
dependencies:
  socket_io_client: ^2.0.3+1
  http: ^1.1.0  # For REST API calls
```

---

## Socket Events & Emits

### 1. Connection Events

#### **Client → Server: Connect**
```dart
// Automatic on connection - no manual event needed
socket.connect();
```

#### **Server → Client: Connection Established**
```dart
socket.onConnect((_) {
  print('Connected to server');
  // Connection established, ready to send events
});
```

---

### 2. User Authentication & Join Events

#### **Client → Server: Join as User**
```dart
socket.emit('join', userId);
```

#### **Server → Client: Join Success**
```dart
socket.on('join-success', (data) {
  print('Join successful: $data');
  // data = {"userId": "USER_ID", "socketId": "SOCKET_ID"}
});
```

#### **Server → Client: Join Error**
```dart
socket.on('join-error', (data) {
  print('Join error: $data');
  // data = {"error": "Error message"}
});
```

---

### 3. Group Management Events

#### **Client → Server: Join Group**
```dart
socket.emit('join-group', groupId);
```

#### **Server → Client: Group Join Confirmation**
```dart
// No specific response event
// Check server logs for confirmation
```

---

### 4. Messaging Events

#### **Client → Server: Send Message (via REST API)**
```dart
// POST /api/messages/send
// Headers: Authorization: Bearer JWT_TOKEN
// Body: {"groupId": "GROUP_ID", "text": "Message text"}

Future<void> sendMessage(String groupId, String text, String jwtToken) async {
  final response = await http.post(
    Uri.parse('$baseUrl/api/messages/send'),
    headers: {
      'Authorization': 'Bearer $jwtToken',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'groupId': groupId,
      'text': text,
    }),
  );
  
  if (response.statusCode == 201) {
    print('Message sent successfully');
  }
}
```

#### **Server → Client: Message Status Update**
```dart
socket.on('message-status', (data) {
  print('Message status: $data');
  // data = {"messageId": "ID", "status": "delivered"}
  // or data = {"messageId": "ID", "status": "seen", "seenBy": "USER_ID"}
});
```

#### **Server → Client: New Message Notification**
```dart
socket.on('new-message', (data) {
  print('New message: $data');
  // data = {"groupId": "ID", "text": "Message text", "sender": "USER_ID", "createdAt": "timestamp"}
  // Update your chat UI here
});
```

---

### 5. Keep-Alive Events

#### **Client → Server: Ping**
```dart
socket.emit('ping');
```

#### **Server → Client: Pong**
```dart
socket.on('pong', (data) {
  print('Pong received');
});
```

---

### 6. Test Events

#### **Client → Server: Test Connection**
```dart
socket.emit('test');
```

#### **Server → Client: Test Response**
```dart
socket.on('test-response', (data) {
  print('Test response: $data');
  // data = {"message": "Test successful!", "socketId": "SOCKET_ID"}
});
```

---

### 7. Disconnect Events

#### **Server → Client: Disconnect**
```dart
socket.onDisconnect((_) {
  print('Disconnected from server');
  // Handle reconnection logic here
});
```

---

## Flutter Implementation

### **1. Socket Service Class**

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:http/http.dart' as http;
import 'dart:convert';

class SocketService {
  late IO.Socket socket;
  String? userId;
  String? groupId;
  String baseUrl = 'http://localhost:5000'; // Change to your server URL
  
  // Initialize socket connection
  void connect(String serverUrl) {
    socket = IO.io(serverUrl, IO.OptionBuilder()
      .setTransports(['websocket'])
      .enableAutoConnect()
      .build());
    
    setupListeners();
  }
  
  // Setup all event listeners
  void setupListeners() {
    // Connection events
    socket.onConnect((_) {
      print('✅ Connected to server');
    });
    
    socket.onDisconnect((_) {
      print('❌ Disconnected from server');
    });
    
    socket.onError((error) {
      print('❌ Socket error: $error');
    });
    
    // User authentication events
    socket.on('join-success', (data) {
      print('✅ Join successful: $data');
    });
    
    socket.on('join-error', (data) {
      print('❌ Join error: $data');
    });
    
    // Messaging events
    socket.on('new-message', (data) {
      print('📨 New message: $data');
      // Handle new message in your UI
      _handleNewMessage(data);
    });
    
    socket.on('message-status', (data) {
      print('📊 Message status: $data');
      // Update message status in UI
      _handleMessageStatus(data);
    });
    
    // Test events
    socket.on('test-response', (data) {
      print('🧪 Test response: $data');
    });
    
    // Keep-alive events
    socket.on('pong', (data) {
      print('🏓 Pong received');
    });
  }
  
  // Join as user
  void joinAsUser(String userId) {
    this.userId = userId;
    socket.emit('join', userId);
    print('👤 Joining as user: $userId');
  }
  
  // Join group
  void joinGroup(String groupId) {
    this.groupId = groupId;
    socket.emit('join-group', groupId);
    print('👥 Joining group: $groupId');
  }
  
  // Send message via REST API
  Future<Map<String, dynamic>?> sendMessage(String groupId, String text, String jwtToken) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/messages/send'),
        headers: {
          'Authorization': 'Bearer $jwtToken',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'groupId': groupId,
          'text': text,
        }),
      );
      
      if (response.statusCode == 201) {
        final data = jsonDecode(response.body);
        print('✅ Message sent successfully');
        return data;
      } else {
        print('❌ Failed to send message: ${response.statusCode}');
        return null;
      }
    } catch (e) {
      print('❌ Error sending message: $e');
      return null;
    }
  }
  
  // Send test event
  void sendTest() {
    socket.emit('test');
    print('🧪 Sending test event');
  }
  
  // Send ping
  void sendPing() {
    socket.emit('ping');
    print('🏓 Sending ping');
  }
  
  // Handle new message
  void _handleNewMessage(dynamic data) {
    // Update your chat UI here
    // data contains: groupId, text, sender, createdAt
  }
  
  // Handle message status
  void _handleMessageStatus(dynamic data) {
    // Update message status in UI
    // data contains: messageId, status, seenBy (optional)
  }
  
  // Disconnect
  void disconnect() {
    socket.disconnect();
    print('🔌 Disconnected from server');
  }
}
```

### **2. Chat Screen Implementation**

```dart
import 'package:flutter/material.dart';

class ChatScreen extends StatefulWidget {
  final String userId;
  final String groupId;
  final String jwtToken;
  
  const ChatScreen({
    Key? key,
    required this.userId,
    required this.groupId,
    required this.jwtToken,
  }) : super(key: key);
  
  @override
  _ChatScreenState createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late SocketService socketService;
  final TextEditingController _messageController = TextEditingController();
  final List<Map<String, dynamic>> _messages = [];
  
  @override
  void initState() {
    super.initState();
    _initializeSocket();
  }
  
  void _initializeSocket() {
    socketService = SocketService();
    
    // Connect to server
    socketService.connect('http://localhost:5000');
    
    // Join as user
    socketService.joinAsUser(widget.userId);
    
    // Join group
    socketService.joinGroup(widget.groupId);
    
    // Setup message handlers
    socketService.socket.on('new-message', (data) {
      setState(() {
        _messages.add({
          'text': data['text'],
          'sender': data['sender'],
          'createdAt': data['createdAt'],
          'isOwn': data['sender'] == widget.userId,
        });
      });
    });
  }
  
  Future<void> _sendMessage() async {
    if (_messageController.text.trim().isEmpty) return;
    
    final text = _messageController.text.trim();
    _messageController.clear();
    
    // Send message via REST API
    final result = await socketService.sendMessage(
      widget.groupId,
      text,
      widget.jwtToken,
    );
    
    if (result != null) {
      // Message sent successfully
      // The new-message event will be received via Socket.IO
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Chat'),
        actions: [
          IconButton(
            onPressed: () => socketService.sendTest(),
            icon: Icon(Icons.bug_report),
            tooltip: 'Test Connection',
          ),
        ],
      ),
      body: Column(
        children: [
          // Messages list
          Expanded(
            child: ListView.builder(
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final message = _messages[index];
                return ListTile(
                  title: Text(message['text']),
                  subtitle: Text(message['sender']),
                  trailing: message['isOwn'] ? Icon(Icons.person) : null,
                );
              },
            ),
          ),
          
          // Message input
          Padding(
            padding: EdgeInsets.all(8.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: InputDecoration(
                      hintText: 'Type a message...',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                SizedBox(width: 8),
                IconButton(
                  onPressed: _sendMessage,
                  icon: Icon(Icons.send),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
  
  @override
  void dispose() {
    socketService.disconnect();
    _messageController.dispose();
    super.dispose();
  }
}
```

### **3. Usage Example**

```dart
class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Wurkify Chat',
      home: ChatScreen(
        userId: '68bbfd06ce1163e85e5b6cc6', // Your user ID
        groupId: 'GROUP_ID_HERE', // Your group ID
        jwtToken: 'YOUR_JWT_TOKEN', // Your JWT token
      ),
    );
  }
}
```

---

## Testing Guide

### **1. Postman Testing Sequence**

1. **Connect to WebSocket:** `ws://localhost:5000/socket.io/?EIO=4&transport=websocket`
2. **Test connection:** `42["test"]`
3. **Join as user:** `42["join","USER_ID"]`
4. **Join group:** `42["join-group","GROUP_ID"]`
5. **Send message via REST API:** `POST /api/messages/send`
6. **Watch for real-time events**

### **2. Flutter Testing**

```dart
// Test connection
socketService.sendTest();

// Test ping
socketService.sendPing();

// Test messaging
await socketService.sendMessage(groupId, 'Test message', jwtToken);
```

### **3. Expected Flow**

```
Connect → Test → Join User → Join Group → Send Message → Receive Events
```

---

## Troubleshooting

### **Common Issues:**

1. **Connection Failed**
   - Check server URL
   - Verify server is running
   - Check network connectivity

2. **Join Events Not Working**
   - Ensure user ID is valid (24 characters)
   - Check JWT token is valid
   - Verify user exists in database

3. **Messages Not Received**
   - Check if user is member of group
   - Verify Socket.IO connection is active
   - Check server logs for errors

4. **Automatic Disconnection**
   - Send ping every 30 seconds
   - Check pingTimeout settings
   - Implement reconnection logic

### **Debug Tips:**

```dart
// Enable debug mode
socket.onConnect((_) => print('Connected'));
socket.onDisconnect((_) => print('Disconnected'));
socket.onError((error) => print('Error: $error'));

// Test individual events
socket.emit('test');
socket.emit('ping');
```

### **Reconnection Logic:**

```dart
void _setupReconnection() {
  socket.onDisconnect((_) {
    print('Disconnected, attempting to reconnect...');
    Future.delayed(Duration(seconds: 5), () {
      socket.connect();
    });
  });
}
```

---

## Key Points

1. **Always connect first** before sending any events
2. **Join as user** before joining groups
3. **Messages are sent via REST API**, not Socket.IO
4. **Socket.IO is for real-time notifications** only
5. **Handle connection errors** and reconnection
6. **Use ping/pong** to keep connection alive
7. **Listen for all relevant events** to update UI
8. **Test with Postman first** before Flutter implementation

---

## Support

For issues or questions:
1. Check server logs for errors
2. Test with Postman WebSocket
3. Verify user/group IDs are valid
4. Check JWT token expiration
5. Ensure proper event formatting

---

**Happy Coding! 🚀**
