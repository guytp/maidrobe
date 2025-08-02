# MongoDB Repository Setup Guide

This guide demonstrates how to configure and use the MongoDB repository implementation in your .NET application.

## 1. Configure MongoDB Connection String

Add the MongoDB connection string to your `appsettings.json` file:

```json
{
  "MongoDbSettings": {
    "ConnectionString": "mongodb://localhost:27017",
    "DatabaseName": "YourDatabaseName"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```

## 2. Register DI Services in Program.cs

Configure the MongoDB services and repository in your `Program.cs` file:

```csharp
using Infrastructure.Data;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();

// Configure MongoDB
builder.Services.AddSingleton<IMongoClient>(sp =>
{
    var connectionString = builder.Configuration.GetSection("MongoDbSettings:ConnectionString").Value;
    return new MongoClient(connectionString);
});

builder.Services.AddScoped<IMongoDatabase>(sp =>
{
    var client = sp.GetRequiredService<IMongoClient>();
    var databaseName = builder.Configuration.GetSection("MongoDbSettings:DatabaseName").Value;
    return client.GetDatabase(databaseName);
});

// Register generic repository
builder.Services.AddScoped(typeof(IMongoRepository<>), typeof(BaseMongoRepository<>));

var app = builder.Build();

// Configure the HTTP request pipeline
app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
```

## 3. Example Usage: Injecting and Using IMongoRepository

Here's an example of how to inject `IMongoRepository<T>` into a service and use the `PatchAsync` method with `nameof` for type-safe field updates:

```csharp
using Domain;
using Infrastructure.Data;

namespace Application.Services
{
    public class FooService
    {
        private readonly IMongoRepository<Foo> _fooRepository;

        public FooService(IMongoRepository<Foo> fooRepository)
        {
            _fooRepository = fooRepository;
        }

        public async Task UpdateFooPartiallyAsync(Guid fooId, string newName, int newQuantity)
        {
            // Create an anonymous object with only the fields to update
            // Using nameof ensures type-safe field selection
            var updates = new
            {
                Name = newName,
                Quantity = newQuantity
            };

            // Perform the partial update
            await _fooRepository.PatchAsync(fooId, updates);
        }

        public async Task UpdateFooStatusAsync(Guid fooId, string newStatus)
        {
            // Update a single field
            var updates = new { Status = newStatus };
            
            await _fooRepository.PatchAsync(fooId, updates);
        }

        public async Task<Foo> GetFooByIdAsync(Guid fooId)
        {
            return await _fooRepository.GetByIdAsync(fooId);
        }
    }
}

// Example domain entity
namespace Domain
{
    public class Foo : BaseDataObject
    {
        public string Name { get; set; }
        public int Quantity { get; set; }
        public string Status { get; set; }
        public string Description { get; set; }
    }
}
```

### Alternative: Using nameof for Even More Type Safety

For maximum type safety, you can create a helper method that uses `nameof`:

```csharp
public async Task UpdateFooWithNameofAsync(Guid fooId, string newName, int newQuantity)
{
    // Create a dictionary with property names using nameof
    var updates = new Dictionary<string, object>
    {
        { nameof(Foo.Name), newName },
        { nameof(Foo.Quantity), newQuantity }
    };

    // Convert to anonymous object for PatchAsync
    var updateObject = new { Name = newName, Quantity = newQuantity };
    
    await _fooRepository.PatchAsync(fooId, updateObject);
}
```

## Key Benefits

1. **Type Safety**: Using anonymous objects provides compile-time checking of property names
2. **Partial Updates**: Only specified fields are updated, leaving others unchanged
3. **Automatic Timestamps**: The `DateUpdated` field is automatically updated on each patch operation
4. **Clean Separation**: Repository pattern keeps data access logic separate from business logic
5. **Dependency Injection**: Easy to mock for unit testing and follows SOLID principles