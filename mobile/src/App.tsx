import { Text, View, useWindowDimensions } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import Settings from "lucide-react-native/icons/settings";
import { useEffect, useMemo, useState } from "react";
import {
  CommonActions,
  DarkTheme,
  NavigationContainer,
  NavigationContext,
  useNavigation,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { DaemonClient } from "./core/client";
import type { Routes } from "./navigation";
import { DaemonContext } from "./platform/context";
import { IconButton, Notice, Screen, Action, colors } from "./components/ui";
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
function TabletSidebar({
  client,
  connect,
}: {
  client: DaemonClient | null;
  connect: (client: DaemonClient) => void;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<Routes>>();
  // Sidebar destinations replace the detail stack so existing unsaved-edit
  // guards run before leaving, instead of hiding an editor under another route.
  const sidebarNavigation = useMemo(
    () => ({
      ...navigation,
      navigate: ((name: keyof Routes, params?: Routes[keyof Routes]) => {
        const state = navigation.getState();
        const current = state.routes[state.index];
        if (
          name === "Conversation" &&
          current.name === name &&
          (current.params as Routes["Conversation"]).id ===
            (params as Routes["Conversation"]).id
        )
          return;
        navigation.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { key: state.routes[0].key, name: "Home" },
              { name, params },
            ],
          }),
        );
      }) as typeof navigation.navigate,
    }),
    [navigation],
  );
  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        borderRightWidth: 1,
        borderColor: colors.border,
      }}
    >
      <NavigationContext.Provider value={sidebarNavigation}>
        <SidebarContent client={client} connect={connect} />
      </NavigationContext.Provider>
    </View>
  );
}
function SidebarContent({
  client,
  connect,
}: {
  client: DaemonClient | null;
  connect: (client: DaemonClient) => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<Routes>>();
  const state = navigation.getState();
  const canSwitchHost =
    state.routes.length === 1 && state.routes[0].name === "Home";
  const picker = canSwitchHost ? (
    <HostPicker
      client={client}
      onConnect={connect}
      onAdd={() => navigation.navigate("Devices", { add: true })}
    />
  ) : (
    <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
      <Action
        label={
          client ? `Switch device · ${client.connection.name}` : "Select device"
        }
        secondary
        onPress={() => navigation.popTo("Home")}
      />
    </View>
  );
  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 8,
          minHeight: 56,
        }}
      >
        <IconButton
          icon={Settings}
          label="Settings"
          onPress={() => navigation.navigate("Settings")}
        />
        <Text
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 18,
            fontWeight: "600",
          }}
        >
          Zotigo
        </Text>
        <IconButton
          icon={Plus}
          label="New session"
          disabled={!client}
          onPress={() => navigation.navigate("NewSession", {})}
        />
      </View>
      {client ? (
        <HomeScreen hostPicker={picker} />
      ) : (
        <>
          {picker}
          <Screen>
            <Notice text="Select a device to connect." />
          </Screen>
        </>
      )}
    </>
  );
}
export default function App() {
  const { width } = useWindowDimensions();
  const wide = width >= 768;
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
            layout={({ children, state, descriptors }) => (
              <View style={{ flex: 1, flexDirection: "row" }}>
                <View
                  key="sidebar"
                  style={{
                    width: wide ? 280 : 0,
                    display: wide ? "flex" : "none",
                  }}
                >
                  {wide && (
                    <NavigationContext.Provider
                      value={
                        descriptors[state.routes[state.index].key].navigation
                      }
                    >
                      <TabletSidebar client={client} connect={connect} />
                    </NavigationContext.Provider>
                  )}
                </View>
                <View key="detail" style={{ flex: 1, minWidth: 0 }}>
                  {children}
                </View>
              </View>
            )}
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
                title: wide ? "Conversations" : "Zotigo",
                headerLeft: () =>
                  wide ? null : (
                    <IconButton
                      icon={Settings}
                      label="Settings"
                      onPress={() => navigation.navigate("Settings")}
                    />
                  ),
                headerRight: () =>
                  wide ? null : (
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
                if (wide)
                  return (
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 32,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 24,
                          fontWeight: "600",
                          marginBottom: 12,
                        }}
                      >
                        Your conversations
                      </Text>
                      <Notice text="Select a conversation from the sidebar, or start a new one." />
                      <IconButton
                        icon={Plus}
                        label="New conversation"
                        disabled={!client}
                        onPress={() => navigation.navigate("NewSession", {})}
                      />
                    </View>
                  );
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
              getId={({ params }) => params.id}
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
