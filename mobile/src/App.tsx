import PanelsTopLeft from "lucide-react-native/icons/panels-top-left";
import { useEffect, useState } from "react";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { DaemonClient } from "./core/client";
import type { Routes } from "./navigation";
import { DaemonContext } from "./platform/context";
import { IconButton, colors } from "./components/ui";
import { HostsScreen } from "./screens/HostsScreen";
import {
  HomeScreen,
  ProjectScreen,
  WorkspaceScreen,
  SourcesScreen,
  SourcePickerScreen,
} from "./screens/CatalogScreens";
import { FilesScreen } from "./screens/FilesScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
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
  const devices = () => {
    client?.dispose();
    setClient(null);
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!client ? (
        <HostsScreen onConnect={setClient} />
      ) : (
        <DaemonContext.Provider value={client}>
          <NavigationContainer key={client.connection.id} theme={theme}>
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
                component={HomeScreen}
                options={{
                  title: client.connection.name,
                  headerLeft: () => (
                    <IconButton
                      icon={PanelsTopLeft}
                      label="Devices"
                      onPress={devices}
                    />
                  ),
                }}
              />
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
                options={{ title: "New conversation" }}
              />
              <Stack.Screen
                name="Files"
                component={FilesScreen}
                options={{ title: "Files" }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: "Settings" }}
              />
              <Stack.Screen
                name="Channels"
                component={ChannelsScreen}
                options={{ title: "Channels" }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </DaemonContext.Provider>
      )}
    </SafeAreaProvider>
  );
}
