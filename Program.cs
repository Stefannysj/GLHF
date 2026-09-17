using GLHF;
using GLHF.Services;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#era-controls");
builder.Services.AddSingleton<ArchiveCatalog>();
await builder.Build().RunAsync();
