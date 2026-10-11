import { View } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import Settings from "lucide-react-native/icons/settings";
import { useEffect, useState } from "react";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { DaemonClient } from "./core/client";
import type { Routes } from "./navigation";
import { DaemonContext } from "./platform/context";
import { IconButton, Notice, Screen, colors } from "./components/ui";
import { HostPicker } from "./components/HostPicker";
import { HostsScreen } from "./screens/HostsScreen";
import {
  HomeScreen,
  ProjectScreen,
  WorkspaceScreen,
  SourcesScreen,
  SourcePickerScreen,
} from "./screens/CatalogScreens";
import { FilesScreen } from "./screens/FilesScreen";
import { SettingsScreen, ModelsScreen } from "./screens/SettingsScreen";
import { ChannelsScreen } from "./screens/ChannelsScreen";
import { NewSessionScreen } from "./screens/NewSessionScreen";
import { ConversationScreen } from "./screens/ConversationScreen";
const Stack = createNativeStackNavigator<Routes>();
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};
export default function App() {
  const [client, setClient] = useState<DaemonClient | null>(null);
  useEffect(() => () => client?.dispose(), [client]);
  const connect = (next: DaemonClient) => {
    client?.dispose();
    setClient(next);
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <DaemonContext.Provider value={client}>
        <NavigationContainer
          key={client?.connection.id ?? "no-device"}
          theme={theme}
        >
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              contentStyle: { backgroundColor: colors.background },
              headerBackButtonDisplayMode: "minimal",
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen
              name="Home"
              options={({ navigation }) => ({
                title: "Zotigo",
                headerLeft: () => (
                  <IconButton
                    icon={Settings}
                    label="Settings"
                    onPress={() => navigation.navigate("Settings")}
                  />
                ),
                headerRight: () => (
                  <IconButton
                    icon={Plus}
                    label="New session"
                    disabled={!client}
                    onPress={() => navigation.navigate("NewSession", {})}
                  />
                ),
              })}
            >
              {({ navigation }) => {
                const picker = (
                  <HostPicker
                    client={client}
                    onConnect={connect}
                    onAdd={() => navigation.navigate("Devices", { add: true })}
                  />
                );
                return client ? (
                  <HomeScreen hostPicker={picker} />
                ) : (
                  <View style={{ flex: 1 }}>
                    {picker}
                    <Screen>
                      <Notice text="Your projects and conversations will appear here. Select a device to connect." />
                    </Screen>
                  </View>
                );
              }}
            </Stack.Screen>
            <Stack.Screen
              name="Project"
              component={ProjectScreen}
              options={({ route }) => ({ title: route.params.title })}
            />
            <Stack.Screen
              name="Workspace"
              component={WorkspaceScreen}
              options={({ route }) => ({ title: route.params.title })}
            />
            <Stack.Screen
              name="Sources"
              component={SourcesScreen}
              options={{ title: "Project sources" }}
            />
            <Stack.Screen
              name="SourcePicker"
              component={SourcePickerScreen}
              options={{ title: "Add source" }}
            />
            <Stack.Screen
              name="Conversation"
              component={ConversationScreen}
              options={({ route }) => ({ title: route.params.title })}
            />
            <Stack.Screen
              name="NewSession"
              component={NewSessionScreen}
              options={{ title: "New session" }}
            />
            <Stack.Screen
              name="Files"
              component={FilesScreen}
              options={{ title: "Files" }}
            />
            <Stack.Screen name="Settings" options={{ title: "Settings" }}>
              {() => <SettingsScreen connected={!!client} />}
            </Stack.Screen>
            <Stack.Screen
              name="Models"
              component={ModelsScreen}
              options={{ title: "Models and runtimes" }}
            />
            <Stack.Screen name="Devices" options={{ title: "Devices" }}>
              {({ route, navigation }) => (
                <HostsScreen
                  onConnect={connect}
                  addOnly={route.params?.add}
                  onClose={() => navigation.goBack()}
                  onChanged={(id) => {
                    if (id === client?.connection.id) {
                      client.dispose();
                      setClient(null);
                    }
                  }}
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="Channels"
              component={ChannelsScreen}
              options={{ title: "Channels" }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </DaemonContext.Provider>
    </SafeAreaProvider>
  );
}
