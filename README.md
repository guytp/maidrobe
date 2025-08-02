# MongoDB Base Repository Implementation

This project implements a base repository pattern for MongoDB in .NET, providing common CRUD operations with automatic timestamp management and support for partial updates.

## Project Structure

- **Domain**: Contains base data object and repository interface definitions
  - `BaseDataObject.cs`: Base class with Id, DateCreated, and DateUpdated properties
  - `IRepository.cs`: Generic repository interface defining CRUD operations

- **Infrastructure.Data**: MongoDB-specific implementation
  - `BaseMongoRepository.cs`: Concrete implementation of IRepository for MongoDB
  - `IMongoRepository.cs`: MongoDB-specific repository interface

- **API**: Web API project demonstrating dependency injection setup
  - `Program.cs`: Shows DI configuration for MongoDB

- **Infrastructure.Data.Tests**: Unit tests for repository functionality

## Features

### CRUD Operations
- **GetByIdAsync**: Retrieve entity by ID
- **CreateAsync**: Create new entity with automatic timestamp setting
- **UpdateAsync**: Full entity replacement with DateUpdated refresh
- **InsertManyAsync**: Batch insert multiple entities
- **DeleteAsync**: Remove entity by ID
- **PatchAsync**: Partial updates with property tracking

### Automatic Timestamp Management
- `DateCreated` is set automatically when creating entities
- `DateUpdated` is refreshed on every update or patch operation
- Timestamps use `DateTimeOffset` for timezone awareness

### Dependency Injection Support
- MongoDB client registered as singleton for connection pooling
- Database and repositories registered as scoped services
- Generic repository registration for any entity type

## Getting Started

### 1. Install Required Packages

```xml
<PackageReference Include="MongoDB.Driver" Version="3.4.2" />
```

### 2. Configure appsettings.json

```json
{
  "ConnectionStrings": {
    "MongoDB": "mongodb://localhost:27017"
  },
  "MongoDB": {
    "DatabaseName": "MyDatabase"
  }
}
```

### 3. Setup Dependency Injection

```csharp
// In Program.cs
var connectionString = builder.Configuration.GetConnectionString("MongoDB") ?? "mongodb://localhost:27017";
var databaseName = builder.Configuration["MongoDB:DatabaseName"] ?? "MyDatabase";

// Register MongoClient as singleton
builder.Services.AddSingleton<IMongoClient>(sp => new MongoClient(connectionString));

// Register IMongoDatabase as scoped
builder.Services.AddScoped<IMongoDatabase>(sp =>
{
    var client = sp.GetRequiredService<IMongoClient>();
    return client.GetDatabase(databaseName);
});

// Register generic repository
builder.Services.AddScoped(typeof(IMongoRepository<>), typeof(BaseMongoRepository<>));
```

### 4. Create Your Entity

```csharp
public class Product : BaseDataObject
{
    public string Name { get; set; }
    public decimal Price { get; set; }
    public int Stock { get; set; }
    public string Category { get; set; }
}
```

### 5. Use in Your Services

```csharp
public class ProductService
{
    private readonly IMongoRepository<Product> _productRepository;

    public ProductService(IMongoRepository<Product> productRepository)
    {
        _productRepository = productRepository;
    }

    // Create a new product
    public async Task<Product> CreateProductAsync(string name, decimal price)
    {
        var product = new Product 
        { 
            Id = Guid.NewGuid(),
            Name = name, 
            Price = price,
            Stock = 0,
            Category = "General"
        };
        return await _productRepository.CreateAsync(product);
    }

    // Partial update using PatchAsync
    public async Task UpdateProductStockAsync(Guid productId, int newStock)
    {
        var updates = new { Stock = newStock };
        await _productRepository.PatchAsync(productId, updates);
    }

    // Update multiple fields
    public async Task UpdateProductDetailsAsync(Guid productId, string name, decimal price)
    {
        var updates = new 
        { 
            Name = name, 
            Price = price 
        };
        
        // Only update specified fields
        await _productRepository.PatchAsync(productId, updates, 
            nameof(Product.Name), nameof(Product.Price));
    }
}
```

## Patch Update Examples

The PatchAsync method supports flexible partial updates:

### Update All Properties in Updates Object
```csharp
var updates = new { Name = "New Name", Price = 99.99m };
await repository.PatchAsync(id, updates);
```

### Update Only Specific Properties
```csharp
var updates = new { Name = "New Name", Price = 99.99m, Stock = 100 };
// Only update Name and Price, ignore Stock
await repository.PatchAsync(id, updates, "Name", "Price");
```

### Type-Safe Property Names with nameof
```csharp
await repository.PatchAsync(id, updates, 
    nameof(Product.Name), 
    nameof(Product.Price));
```

## Collection Naming Convention

Collections are named using lowercase plural convention:
- `Product` entity -> `products` collection
- `Customer` entity -> `customers` collection
- `Order` entity -> `orders` collection

## Error Handling

All repository methods include comprehensive error handling:
- `ArgumentNullException` for null parameters
- `InvalidOperationException` for entity not found scenarios
- Wrapped `MongoException` with contextual information

## Testing

The project includes comprehensive unit tests demonstrating:
- All CRUD operations
- Timestamp management verification
- Error handling scenarios
- Patch update functionality
- Mock setup for MongoDB driver interfaces

Run tests with:
```bash
dotnet test Infrastructure.Data.Tests/Infrastructure.Data.Tests.csproj
```

## Best Practices

1. **Use Scoped Repositories**: Register repositories as scoped to ensure proper lifecycle management
2. **Leverage Patch Updates**: Use PatchAsync for partial updates to minimize data transfer
3. **Type Safety**: Use nameof() operator for property names in patch operations
4. **Timestamp Awareness**: DateTimeOffset ensures timezone-aware timestamps
5. **Connection Pooling**: MongoClient registered as singleton for efficient connection reuse

## Migration Considerations

For existing repositories not following interface patterns:
1. Extract interface from existing repository classes
2. Update DI registrations to use interfaces
3. Gradually migrate to inherit from BaseMongoRepository
4. Update consumers to depend on interfaces rather than concrete types