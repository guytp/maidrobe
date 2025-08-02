using MongoDB.Driver;
using Infrastructure.Data;
using Domain;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure MongoDB services
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

// Register generic IMongoRepository<T> to BaseMongoRepository<T> as scoped
builder.Services.AddScoped(typeof(IMongoRepository<>), typeof(BaseMongoRepository<>));

// Add controllers support
builder.Services.AddControllers();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.MapControllers();

app.Run();
